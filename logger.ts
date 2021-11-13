import { TMessage } from './types';

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

export class Logger {
  messages: TLog[] = [];

  level!: ELogLevel;

  hasConsoleLog!: boolean;

  frequency!: number;

  isEnable!: boolean;

  currentOrder?: TMessage = undefined;

  saveCallBack!: (messages: TLog[]) => any;

  constructor(level: ELogLevel, saveCallBack: (messages: TLog[]) => any, hasConsoleLog = true, frequency: number = 1, isEnable = true) {
    this.level = level;
    this.frequency = frequency;
    this.hasConsoleLog = hasConsoleLog;
    this.saveCallBack = saveCallBack;
    this.isEnable = isEnable;
  }

  setMessage(order: TMessage) {
    this.currentOrder = order;
  }

  add(message: string, meta?: any, level = this.level) {
    const date = Date.now().toString();
    const order = this.currentOrder;
    if (this.hasConsoleLog) {
      console[this.level === ELogLevel.ERROR ? 'error' : 'log'](message, meta, date, order);
    }

    if (this.isEnable) {
      this.messages.push({ message, level, meta, date, order });
      if (this.messages.length >= this.frequency) {
        this.saveCallBack([...this.messages]);
        this.messages = [];
      }
    }
  }

  error(message: string, meta?: any) {
    this.add(message, ELogLevel.ERROR, meta);
  }
} 