export enum EType {
  OPEN = 'OPEN',
  CLOSE = 'CLOSE',
  MODIFICATION = 'MODIFICATION',
};

export enum ETypeContract {
  MARKET = 'MARKET',
  LIMIT = 'LIMIT',
}

export enum EAction {
  BUY = 'BUY',
  SELL = 'sell',
}

export type TMessage = {
  messageId: number,
  orderId: number,
  channelId: string,
  ticker: string,
  type: EType,
  contractType: ETypeContract,
  price?: number,
  takeProfit?: number,
  previousTakeProfit?: number,
  stopLoss?: number,
  previousStopLoss?: number,
  action: EAction,
  analitics?: any,
};