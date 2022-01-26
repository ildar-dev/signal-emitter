import { TMessage } from './types';
import config from './config.json';

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
  if (value === null || value === undefined) {
    return '';
  }
  if (value.getTime) {
    return formatter.format(value);
  }
  if (Array.isArray(value)) {
   return value.map(serializer).join(', ')
  } else {
    switch (typeof value) {
      case 'function': {
        return value.toString();
      }
      case 'object': {
        return `{ ${Object.entries(value).map(([key, v]) => `${key}: ${serializer(v)}`).join(', ')} }`
      }
      default: {
        return value;
      }
    }
  }
}
export class Logger {
  messages: TLog[] = [];

  level!: ELogLevel;

  hasConsoleLog!: boolean;

  frequency!: number;

  isEnable!: boolean;

  constructor(level: ELogLevel, hasConsoleLog = true, frequency = 1, isEnable = true) {
    this.level = level;
    this.frequency = frequency;
    this.hasConsoleLog = hasConsoleLog;
    this.isEnable = isEnable;
  }

  add(message: TMessage, string: string, meta: any = null, extraMessage: string | null = null, level = this.level) {
    if (!this.hasConsoleLog) {
      return;
    }
    console.log(level === ELogLevel.ERROR ? '\x1b[31m' : '\x1b[33m', ...[message.orderId, string, serializer(meta), formatter.format(Date.now())]);

    const options = {
      uri: `http://${config.log.server.host}:${config.log.server.port}`,
      method: 'POST',
      json: {
        "message": `*#id${message.orderId}*\n${string}\n${serializer(meta)}\n${extraMessage}`
      }
    };

    request(options, (error: any) => {
      if (error) {
        console.log(error);
      }
    });
  }

  error(message: TMessage, string: string, meta?: unknown, extraMessage: string | null = null) {
    this.add(message, string, meta, extraMessage, ELogLevel.ERROR);
  }
} 
