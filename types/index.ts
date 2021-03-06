export type TDocumentOrder = {
  orderId: number,
  orderType: EOrderType,
  orderIdMessage: number,
  date: number,
  message: TMessage,
  total: number,
}

export enum EType {
  OPEN = 'OPEN',
  CLOSE = 'CLOSE',
  MODIFICATION = 'MODIFICATION',
}

export enum EOrderType {
  OPEN = 'OPEN',
  CLOSE = 'CLOSE',
  TAKEPROFIT = 'TAKEPROFIT',
  STOPLOSS = 'STOPLOSS',
}

export enum ETypeContract {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum EAction {
  BUY = 'BUY',
  SELL = 'SELL',
}

export type TMessage = {
  messageId: number,
  orderId: number,
  channelId: string,
  ticker: string,
  type: EType,
  contractType: ETypeContract,
  price: number,
  takeProfit?: number,
  previousTakeProfit?: number,
  stopLoss?: number,
  previousStopLoss?: number,
  action: EAction,
  percentage: number,
  lot: number,
  analitics?: Record<string, unknown>,
  extra?: {
    messageLink: string,
    expected: {
      income: number,
      price: number
    }
  }
};

export type THandler = (message: string) => Promise<void>;

export type TStarter = () => Promise<void>;

export type TBroker = {
  handler: THandler,
  starter: TStarter,
}
