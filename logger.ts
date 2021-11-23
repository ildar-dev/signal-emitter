import { TMessage } from './types';
import config from './config.json';

export enum ELogLevel {
  ALL = 'ALL',
  ERROR = 'ERROR',
};

export type TLog = { 
  message: string, 
  level: ELogLevel, 
  meta?: any,
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
});

export class Logger {
  messages: TLog[] = [];

  level!: ELogLevel;

  hasConsoleLog!: boolean;

  frequency!: number;

  isEnable!: boolean;


  constructor(level: ELogLevel, hasConsoleLog = true, frequency: number = 1, isEnable = true) {
    this.level = level;
    this.frequency = frequency;
    this.hasConsoleLog = hasConsoleLog;
    this.isEnable = isEnable;
  }

  add(orderId: number, message: string, meta: any = '', level = this.level) {
    if (!this.hasConsoleLog) {
      return;
    }
    console.log(this.level === ELogLevel.ERROR ? '\x1b[31m' : '\x1b[33m', ...[message, meta, formatter.format(Date.now()), orderId]);
  }

  error(orderId: number, message: string, meta?: any) {
    this.add(orderId, message, ELogLevel.ERROR, meta);
  }
} 
