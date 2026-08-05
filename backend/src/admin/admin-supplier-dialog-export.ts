import { strToU8, zipSync } from 'fflate';

export type SupplierDialogExportMessage = {
  createdAt: Date;
  author: string;
  role: string;
  text: string;
  messageType: string;
  isInternal: boolean;
};

export type SupplierDialogExportRequest = {
  id: string;
  ticketId: string;
  dialogTitle: string;
  clientName: string;
  supplierName: string;
  supplierEmployeeName: string;
  managerName: string;
  requestText: string;
  status: string;
  createdAt: Date;
  claimedAt: Date | null;
  firstResponseAt: Date | null;
  closedAt: Date | null;
  responseBreached: boolean;
  messages: SupplierDialogExportMessage[];
};

export type SupplierDialogExportData = {
  period: { from: Date; to: Date };
  generatedAt: Date;
  supplierName: string | null;
  requests: SupplierDialogExportRequest[];
};

const average = (values: Array<number | null>) => {
  const valid = values.filter(
    (value): value is number => typeof value === 'number' && value >= 0,
  );

  return valid.length
    ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length)
    : null;
};

const duration = (from?: Date | null, to?: Date | null) =>
  from && to ? Math.max(to.getTime() - from.getTime(), 0) : null;

export const isInsideSupplierRequestWindow = (
  messageCreatedAt: Date,
  requestCreatedAt: Date,
  requestClosedAt: Date | null,
  generatedAt: Date,
) =>
  messageCreatedAt >= requestCreatedAt &&
  messageCreatedAt <= (requestClosedAt ?? generatedAt);

export const calculateSupplierDialogExportMetrics = (
  requests: SupplierDialogExportRequest[],
) => ({
  totalRequests: requests.length,
  claimedRequests: requests.filter((request) => request.claimedAt).length,
  answeredRequests: requests.filter((request) => request.firstResponseAt)
    .length,
  closedRequests: requests.filter((request) => request.closedAt).length,
  openRequests: requests.filter((request) => !request.closedAt).length,
  overdueRequests: requests.filter((request) => request.responseBreached)
    .length,
  avgClaimMs: average(
    requests.map((request) => duration(request.createdAt, request.claimedAt)),
  ),
  avgFirstResponseMs: average(
    requests.map((request) =>
      duration(request.createdAt, request.firstResponseAt),
    ),
  ),
  avgWorkMs: average(
    requests.map((request) => duration(request.claimedAt, request.closedAt)),
  ),
  avgTotalMs: average(
    requests.map((request) => duration(request.createdAt, request.closedAt)),
  ),
});

const formatDuration = (value: number | null) => {
  if (value === null) return 'Нет данных';
  const minutes = value / 60_000;
  if (minutes < 1) return `${Math.round(value / 1000)} сек`;
  if (minutes < 60) return `${minutes.toFixed(1)} мин`;
  return `${(minutes / 60).toFixed(1)} ч`;
};

const formatDate = (value?: Date | null) =>
  value
    ? new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(value)
    : '';

const statusLabel = (request: SupplierDialogExportRequest) => {
  if (request.closedAt) return 'Решён поставщиком';
  if (!request.claimedAt) return 'Не взят в работу';
  return 'Ещё в работе';
};

const roleLabel = (role: string) => {
  const labels: Record<string, string> = {
    manager: 'Менеджер',
    supplier: 'Поставщик',
    client: 'Клиент',
    system: 'Системное событие',
  };
  return labels[role] ?? role;
};

const xmlEscape = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const columnName = (index: number) => {
  let value = index;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
};

const cellXml = (
  value: string | number,
  row: number,
  column: number,
  style: number,
) => {
  const reference = `${columnName(column)}${row}`;
  if (typeof value === 'number') {
    return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  }
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
};

const sheetXml = ({
  rows,
  widths,
  headerRow,
  merge,
  hideGridLines = false,
}: {
  rows: Array<Array<string | number>>;
  widths: number[];
  headerRow?: number;
  merge?: string;
  hideGridLines?: boolean;
}) => {
  const maxColumn = Math.max(widths.length, ...rows.map((row) => row.length));
  const rowXml = rows
    .map((values, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const style =
        rowNumber === headerRow
          ? 1
          : rowNumber === 1 && merge
            ? 2
            : rowNumber % 2 === 0
              ? 3
              : 0;
      return `<row r="${rowNumber}">${values
        .map((value, columnIndex) =>
          cellXml(value, rowNumber, columnIndex + 1, style),
        )
        .join('')}</row>`;
    })
    .join('');
  const columns = widths
    .map(
      (width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
    )
    .join('');
  const pane = headerRow
    ? `<pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/>`
    : '';
  const autoFilter = headerRow
    ? `<autoFilter ref="A${headerRow}:${columnName(maxColumn)}${rows.length}"/>`
    : '';
  const merges = merge
    ? `<mergeCells count="1"><mergeCell ref="${merge}"/></mergeCells>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0" showGridLines="${hideGridLines ? 0 : 1}">${pane}</sheetView></sheetViews>
  <cols>${columns}</cols>
  <sheetData>${rowXml}</sheetData>
  ${autoFilter}${merges}
</worksheet>`;
};

const workbookFiles = (
  sheets: Array<{ name: string; xml: string }>,
  generatedAt: Date,
) => {
  const sheetOverrides = sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');
  const workbookSheets = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');
  const workbookRelations = sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('');
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml':
      strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${sheetOverrides}
</Types>`),
    '_rels/.rels':
      strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`),
    'xl/workbook.xml':
      strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels':
      strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRelations}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml':
      strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Arial"/></font><font><b/><sz val="18"/><color rgb="FF0F172A"/><name val="Arial"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`),
    'docProps/core.xml':
      strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>TouchSpace Chat</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${generatedAt.toISOString()}</dcterms:created></cp:coreProperties>`),
    'docProps/app.xml':
      strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>TouchSpace Chat</Application></Properties>`),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheet.xml);
  });
  return files;
};

export const buildSupplierDialogWorkbook = async (
  data: SupplierDialogExportData,
) => {
  const metrics = calculateSupplierDialogExportMetrics(data.requests);
  const summaryRows: Array<Array<string | number>> = [
    ['Отчёт по диалогам с поставщиками'],
    ['Период', formatDate(data.period.from), '—', formatDate(data.period.to)],
    ['Поставщик', data.supplierName ?? 'Все поставщики'],
    ['Сформирован', formatDate(data.generatedAt)],
    [],
    ['Показатель', 'Значение', 'Как считается', 'Примечание'],
    [
      'Направлено запросов',
      metrics.totalRequests,
      'По дате отправки менеджером',
      '',
    ],
    [
      'Взято в работу',
      metrics.claimedRequests,
      'Есть дата «Взять в работу»',
      '',
    ],
    [
      'Получен первый ответ',
      metrics.answeredRequests,
      'Есть первое сообщение поставщика',
      '',
    ],
    [
      'Решено поставщиком',
      metrics.closedRequests,
      'Поставщик нажал «Решён»',
      '',
    ],
    [
      'Ещё в работе',
      metrics.openRequests,
      'Нет даты решения',
      'Переписка выгружена до момента формирования',
    ],
    [
      'Просрочен первый ответ',
      metrics.overdueRequests,
      'Превышен SLA ответа поставщика',
      '',
    ],
    [
      'Среднее время принятия',
      formatDuration(metrics.avgClaimMs),
      'От запроса до «Взять в работу»',
      'Только взятые запросы',
    ],
    [
      'Среднее время первого ответа',
      formatDuration(metrics.avgFirstResponseMs),
      'От запроса до первого ответа поставщика',
      'Только запросы с ответом',
    ],
    [
      'Среднее время работы',
      formatDuration(metrics.avgWorkMs),
      'От «Взять в работу» до «Решён»',
      'Только закрытые запросы',
    ],
    [
      'Среднее полное время',
      formatDuration(metrics.avgTotalMs),
      'От запроса менеджера до «Решён»',
      'Только закрытые запросы',
    ],
  ];
  const requestRows: Array<Array<string | number>> = [
    [
      'ID запроса',
      'Диалог',
      'Клиент',
      'Поставщик',
      'Сотрудник поставщика',
      'Менеджер',
      'Текст запроса',
      'Статус',
      'Отправлен',
      'Взят в работу',
      'Первый ответ',
      'Решён',
      'Время принятия',
      'Время первого ответа',
      'Время работы',
      'Полное время',
      'Просрочка SLA',
    ],
  ];
  const messageRows: Array<Array<string | number>> = [
    [
      'ID запроса',
      'Поставщик',
      'Диалог',
      'Клиент',
      'Дата и время',
      'Автор',
      'Роль',
      'Тип',
      'Сообщение',
    ],
  ];

  for (const request of data.requests) {
    requestRows.push([
      request.id,
      request.dialogTitle,
      request.clientName,
      request.supplierName,
      request.supplierEmployeeName,
      request.managerName,
      request.requestText,
      statusLabel(request),
      formatDate(request.createdAt),
      request.claimedAt ? formatDate(request.claimedAt) : 'Не взят',
      request.firstResponseAt
        ? formatDate(request.firstResponseAt)
        : 'Нет ответа',
      request.closedAt ? formatDate(request.closedAt) : 'Не закрыт',
      formatDuration(duration(request.createdAt, request.claimedAt)),
      formatDuration(duration(request.createdAt, request.firstResponseAt)),
      formatDuration(duration(request.claimedAt, request.closedAt)),
      formatDuration(duration(request.createdAt, request.closedAt)),
      request.responseBreached ? 'Да' : 'Нет',
    ]);
    const timeline: SupplierDialogExportMessage[] = [
      {
        createdAt: request.createdAt,
        author: request.managerName,
        role: 'manager',
        text: request.requestText,
        messageType: 'Запрос поставщику',
        isInternal: true,
      },
      ...(request.claimedAt
        ? [
            {
              createdAt: request.claimedAt,
              author: request.supplierEmployeeName || request.supplierName,
              role: 'system',
              text: 'Поставщик взял запрос в работу',
              messageType: 'Событие',
              isInternal: true,
            },
          ]
        : []),
      ...request.messages,
      ...(request.closedAt
        ? [
            {
              createdAt: request.closedAt,
              author: request.supplierEmployeeName || request.supplierName,
              role: 'system',
              text: 'Поставщик отметил запрос решённым',
              messageType: 'Событие',
              isInternal: true,
            },
          ]
        : []),
    ].sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
    for (const message of timeline) {
      messageRows.push([
        request.id,
        request.supplierName,
        request.dialogTitle,
        request.clientName,
        formatDate(message.createdAt),
        message.author,
        roleLabel(message.role),
        message.isInternal
          ? `${message.messageType} · внутреннее`
          : message.messageType,
        message.text,
      ]);
    }
  }

  const sheets = [
    {
      name: 'Сводка',
      xml: sheetXml({
        rows: summaryRows,
        widths: [32, 24, 42, 42],
        headerRow: 6,
        merge: 'A1:D1',
        hideGridLines: true,
      }),
    },
    {
      name: 'Запросы',
      xml: sheetXml({
        rows: requestRows,
        widths: [
          28, 34, 24, 28, 26, 24, 60, 22, 20, 20, 20, 20, 20, 22, 20, 20, 17,
        ],
        headerRow: 1,
      }),
    },
    {
      name: 'Переписка',
      xml: sheetXml({
        rows: messageRows,
        widths: [28, 28, 34, 24, 20, 26, 20, 20, 80],
        headerRow: 1,
      }),
    },
  ];

  return zipSync(workbookFiles(sheets, data.generatedAt), { level: 6 });
};
