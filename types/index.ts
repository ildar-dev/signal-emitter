export type TMessage = {
  messageId: number,
  orderId: number,
  channelId: string,
  ticker: string,
  type: 'BUY' | 'SELL' | 'CLOSE' | 'MODIFICATION',
  typeContract: 'MARKET' | 'LIMIT',
  price: number,
  takeProfit?: number,
  stopLoss?: number,
  analitics?: any,
};