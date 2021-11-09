export enum EType {
  OPEN = 'open',
  CLOSE = 'close',
  MODIFICATION = 'modification',
};

export enum ETypeContract {
  MARKET = 'market',
  LIMIT = 'limit',
}

export enum EAction {
  BUY = 'buy',
  SELL = 'sell',
}

export type TMessage = {
  messageId: number,
  orderId: number,
  channelId: string,
  ticker: string,
  type: EType,
  typeContract: ETypeContract,
  price?: number,
  takeProfit?: number,
  previousTakeProfit?: number,
  stopLoss?: number,
  previousStopLoss?: number,
  action: EAction,
  analitics?: any,
};