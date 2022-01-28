import { TMessage } from './types';
import config from './config.json';
import { threadId } from 'worker_threads';

let request = require('request');

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

export const errorSerializer = (error: any): string => {
  return error.details || error.message || error.stringCode || error;
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
  }

  push(message: TMessage) {
    if (!this.isEnable) {
      return;
    }
    const now = formatter.format(Date.now());
    if (this.hasConsoleOutput) {
      console.log(`${ message.orderId } ${ this.messages.map(_ => _.join(' ')).join(' | ') } | ${ now }`);
    }
    if (this.hasApiOutput) {
      const options = {
        uri: `http://${config.log.server.host}:${config.log.server.port}`,
        method: 'POST',
        json: {
          "message": `${this.messages.map(_ => _.join('\n')).join('\n')}\n#id${message.orderId}\n(link)[${message.extra?.messageLink}]`
        }
      };
      request(options, (error: any) => {
        if (error) {
          console.error('TG_WARNINGS', error);
        }
      });
    }
  }
} 
