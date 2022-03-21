import { TMessage } from './types';
import config from './config.json';
import telegramSender from './telegramSender';

export enum ELogLevel {
  ALL = 'ALL',
  ERROR = 'ERROR',
}

export type TLog = { 
  message: string, 
  level: ELogLevel, 
  meta?: unknown,
  date: string,
  order?: TMessage,
}

const formatter = new Intl.DateTimeFormat('ru', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: config.log.timeZone,
})

export const errorSerializer = (error: any, hasFullError = false): string => {
  const result = error.details || error.message || error.stringCode || error;
  return hasFullError
  ? (result !== error ? `${result}\n${error}` : result)
  : result;
}

export const serializer = (value: any): string => {
  value = errorSerializer(value);
  if (value === null || value === undefined) {
    return '';
  }
  if (value.getTime) {
    return formatter.format(value);
  }
  if (Array.isArray(value)) {
   return value.map(serializer).join(', ')
  }
  switch (typeof value) {
    case 'function': {
      return value.toString();
    }
    case 'object': {
      return `${Object.entries(value).map(([key, v]) => `${key}: ${serializer(v)}`).join(', ')}`
    }
    default: {
      return value;
    }
  }
}
export class Logger {
  messages: string[][] = [];

  hasConsoleOutput!: boolean;
  hasApiOutput!: boolean;
  isEnable!: boolean;
  hasErrors = false;

  constructor(hasConsoleOutput = true, hasApiOutput = true, isEnable = true) {
    this.hasConsoleOutput = hasConsoleOutput;
    this.hasApiOutput = hasApiOutput;
    this.isEnable = isEnable;
  }

  add(...strings: string[]) {
    if (this.isEnable) {
      this.messages.push(strings);
    }
  }

  error(...strings: string[]) {
    this.add(`❌ ${strings[0]}`, ...strings.slice(1));
    this.hasErrors = true;
  }

  push(message: TMessage | null) {
    if (!this.isEnable) {
      return;
    }
    const now = formatter.format(Date.now());
    if (this.hasConsoleOutput && message) {
      console.log(`${ message.orderId } ${ this.messages.map(_ => _.join(' ')).join(' | ') } | ${ now }${this.hasErrors ? ` | ${ serializer(message) }` : ''}`);
    }
    if (this.hasApiOutput && this.hasErrors) {
      telegramSender(`${this.messages.map(_ => _.join('\n')).join('\n')}\n${JSON.stringify(message)}${(message?.extra?.messageLink?.length && false) ? `\n[link](${message.extra?.messageLink})` : ''}`);
    }
  }
} 
