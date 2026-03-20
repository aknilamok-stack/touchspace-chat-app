import { Injectable } from '@nestjs/common';

type TicketTypingState = {
  clientLastTypingAt?: number;
};

@Injectable()
export class TypingService {
  private readonly typingState = new Map<string, TicketTypingState>();

  setTyping(ticketId: string, senderType: string) {
    if (senderType !== 'client') {
      return;
    }

    const currentState = this.typingState.get(ticketId) ?? {};

    this.typingState.set(ticketId, {
      ...currentState,
      clientLastTypingAt: Date.now(),
    });
  }

  clearTyping(ticketId: string, senderType?: string) {
    if (senderType && senderType !== 'client') {
      return;
    }

    const currentState = this.typingState.get(ticketId);

    if (!currentState) {
      return;
    }

    delete currentState.clientLastTypingAt;

    if (!currentState.clientLastTypingAt) {
      this.typingState.delete(ticketId);
      return;
    }

    this.typingState.set(ticketId, currentState);
  }

  getTyping(ticketId: string) {
    const state = this.typingState.get(ticketId);
    const clientTyping =
      typeof state?.clientLastTypingAt === 'number' &&
      Date.now() - state.clientLastTypingAt < 3000;

    if (!clientTyping && state) {
      this.typingState.delete(ticketId);
    }

    return { clientTyping };
  }
}
