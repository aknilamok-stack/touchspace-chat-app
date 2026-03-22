import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../prisma.service';

type AiAnalysisPayload = {
  topicCategory: string;
  sentiment: string;
  aiSummary: string;
  aiTags: string[];
  insightFlags: string[];
};

type InsightsAiPayload = {
  executiveSummary: string;
  triggerThemes: Array<{
    theme: string;
    count: number;
    explanation: string;
  }>;
  recommendations: string[];
};

@Injectable()
export class AdminAiService {
  private readonly client: OpenAI | null;
  private readonly model: string;

  constructor(private readonly prisma: PrismaService) {
    this.client = process.env.OPENAI_API_KEY
      ? new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
        })
      : null;
    this.model = process.env.OPENAI_ADMIN_MODEL?.trim() || 'gpt-5-mini';
  }

  private ensureClient() {
    if (!this.client) {
      throw new InternalServerErrorException(
        'OPENAI_API_KEY не задан. Добавьте ключ в окружение backend.',
      );
    }

    return this.client;
  }

  private normalizeStringArray(value: unknown) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, 8);
  }

  private normalizeInsightsPayload(value: unknown): InsightsAiPayload {
    if (!value || typeof value !== 'object') {
      return {
        executiveSummary: 'AI не смог подготовить сводку.',
        triggerThemes: [],
        recommendations: [],
      };
    }

    const payload = value as Partial<InsightsAiPayload>;

    return {
      executiveSummary:
        typeof payload.executiveSummary === 'string'
          ? payload.executiveSummary.trim()
          : 'AI не смог подготовить сводку.',
      triggerThemes: Array.isArray(payload.triggerThemes)
        ? payload.triggerThemes
            .map((item) => ({
              theme:
                typeof item?.theme === 'string' ? item.theme.trim() : 'Без названия',
              count: typeof item?.count === 'number' ? item.count : 0,
              explanation:
                typeof item?.explanation === 'string'
                  ? item.explanation.trim()
                  : '',
            }))
            .filter((item) => item.theme)
            .slice(0, 6)
        : [],
      recommendations: this.normalizeStringArray(payload.recommendations).slice(0, 5),
    };
  }

  private extractJson(text: string) {
    const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);

    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const objectStart = text.indexOf('{');
    const objectEnd = text.lastIndexOf('}');

    if (objectStart >= 0 && objectEnd > objectStart) {
      return text.slice(objectStart, objectEnd + 1);
    }

    return text;
  }

  private parseAnalysis(text: string): AiAnalysisPayload {
    try {
      const parsed = JSON.parse(this.extractJson(text)) as Partial<AiAnalysisPayload>;

      return {
        topicCategory: parsed.topicCategory?.trim() || 'Без категории',
        sentiment: parsed.sentiment?.trim() || 'neutral',
        aiSummary: parsed.aiSummary?.trim() || 'Сводка не сформирована',
        aiTags: this.normalizeStringArray(parsed.aiTags),
        insightFlags: this.normalizeStringArray(parsed.insightFlags),
      };
    } catch {
      throw new InternalServerErrorException(
        'OpenAI вернул ответ, который не удалось разобрать как JSON.',
      );
    }
  }

  private parseInsightsSummary(text: string): InsightsAiPayload {
    try {
      const parsed = JSON.parse(this.extractJson(text));
      return this.normalizeInsightsPayload(parsed);
    } catch {
      throw new InternalServerErrorException(
        'OpenAI вернул ответ по инсайтам, который не удалось разобрать как JSON.',
      );
    }
  }

  private buildPrompt(dialog: {
    id: string;
    title: string;
    status: string;
    clientName: string | null;
    assignedManagerName: string | null;
    supplierName: string | null;
    messages: Array<{
      senderRole: string | null;
      senderType: string;
      content: string;
      createdAt: Date;
    }>;
    supplierRequests: Array<{
      supplierName: string;
      status: string;
      requestText: string;
      createdAt: Date;
      firstResponseAt: Date | null;
    }>;
  }) {
    const transcript = dialog.messages
      .slice(-80)
      .map(
        (message) =>
          `[${message.createdAt.toISOString()}] ${message.senderRole ?? message.senderType}: ${message.content}`,
      )
      .join('\n');

    const supplierContext = dialog.supplierRequests.length
      ? dialog.supplierRequests
          .map(
            (request) =>
              `Поставщик: ${request.supplierName}; статус: ${request.status}; запрос: ${request.requestText}; первый ответ: ${request.firstResponseAt?.toISOString() ?? 'нет'}`,
          )
          .join('\n')
      : 'Запросы поставщику отсутствуют.';

    return `
Ты анализируешь диалог клиентской support/chat-системы TouchSpace для админки.

Верни строго JSON без пояснений и без markdown:
{
  "topicCategory": "короткая категория обращения",
  "sentiment": "positive|neutral|negative|mixed",
  "aiSummary": "краткая сводка на русском языке, 2-4 предложения",
  "aiTags": ["тег1", "тег2"],
  "insightFlags": ["флаг1", "флаг2"]
}

Правила:
- Пиши всё на русском.
- topicCategory должен быть коротким и понятным для B2B-админки.
- aiTags: 2-6 коротких тегов.
- insightFlags: только важные сигналы для админа, например "риск SLA", "нужна эскалация", "негатив клиента", "повторное обращение".
- Если сигналов нет, верни пустой массив.

Метаданные диалога:
- ID: ${dialog.id}
- Заголовок: ${dialog.title}
- Статус: ${dialog.status}
- Клиент: ${dialog.clientName ?? 'не указан'}
- Менеджер: ${dialog.assignedManagerName ?? 'не указан'}
- Поставщик: ${dialog.supplierName ?? 'не указан'}

Контекст запросов поставщику:
${supplierContext}

История сообщений:
${transcript}
`.trim();
  }

  async analyzeDialog(id: string) {
    const dialog = await this.prisma.ticket.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
          select: {
            senderRole: true,
            senderType: true,
            content: true,
            createdAt: true,
          },
        },
        supplierRequests: {
          orderBy: {
            createdAt: 'asc',
          },
          select: {
            supplierName: true,
            status: true,
            requestText: true,
            createdAt: true,
            firstResponseAt: true,
          },
        },
      },
    });

    if (!dialog) {
      throw new NotFoundException(`Dialog with id "${id}" not found`);
    }

    const client = this.ensureClient();
    const response = await client.responses.create({
      model: this.model,
      input: this.buildPrompt(dialog),
    });

    const parsed = this.parseAnalysis(response.output_text);

    const updatedTicket = await this.prisma.ticket.update({
      where: { id },
      data: {
        topicCategory: parsed.topicCategory,
        sentiment: parsed.sentiment,
        aiSummary: parsed.aiSummary,
        aiTags: parsed.aiTags,
        insightFlags: parsed.insightFlags,
      },
    });

    return {
      ticketId: updatedTicket.id,
      model: this.model,
      analysis: parsed,
    };
  }

  async generateInsightsSummary(input?: {
    preset?: string;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const client = this.ensureClient();
    const now = new Date();
    const preset = input?.preset?.trim() || 'month';
    const to = input?.dateTo ? new Date(input.dateTo) : now;
    const from = input?.dateFrom
      ? new Date(input.dateFrom)
      : new Date(
          now.getTime() -
            (preset === 'day' ? 1 : preset === 'week' ? 7 : 30) *
              24 *
              60 *
              60 *
              1000,
        );

    const tickets = await this.prisma.ticket.findMany({
      where: {
        createdAt: {
          gte: from,
          lte: to,
        },
      },
      include: {
        messages: {
          select: {
            content: true,
            senderRole: true,
            senderType: true,
            createdAt: true,
          },
          orderBy: {
            createdAt: 'asc',
          },
          take: 12,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 80,
    });

    const compactTickets = tickets.map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
      topicCategory: ticket.topicCategory,
      sentiment: ticket.sentiment,
      firstResponseTime: ticket.firstResponseTime,
      messages: ticket.messages.map((message) => ({
        role: message.senderRole ?? message.senderType,
        createdAt: message.createdAt.toISOString(),
        content: message.content,
      })),
    }));

    const response = await client.responses.create({
      model: this.model,
      input: `
Ты анализируешь обращения в TouchSpace admin analytics.

Верни строго JSON без markdown:
{
  "executiveSummary": "краткая сводка на русском, 3-5 предложений",
  "triggerThemes": [
    {
      "theme": "короткая тема",
      "count": 12,
      "explanation": "что именно люди спрашивали"
    }
  ],
  "recommendations": ["короткая рекомендация 1", "короткая рекомендация 2"]
}

Правила:
- Пиши только на русском.
- Выделяй повторяющиеся триггеры обращений: сроки, доставка, ламинат, наличие, рекламации и т.п.
- Если видишь сезонный/поведенческий паттерн, упомяни это в executiveSummary.
- triggerThemes ограничь 3-6 элементами.
- recommendations ограничь 2-5 пунктами.

Период:
- с ${from.toISOString()}
- по ${to.toISOString()}

Данные:
${JSON.stringify(compactTickets)}
      `.trim(),
    });

    return {
      period: {
        from,
        to,
        preset,
      },
      model: this.model,
      insights: this.parseInsightsSummary(response.output_text),
    };
  }
}
