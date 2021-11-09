export type TMessage = {
  //* Message id from signal-message
  messageId: number,
  orderId: number,
  channelId: string,
  ticker: string,
  type: 'OPEN' | 'CLOSE' | 'MODIFICATION',
  typeContract: 'MARKET' | 'LIMIT',
  price?: number,
  takeProfit?: number,
  previousTakeProfit?: number,
  stopLoss?: number,
  previousStopLoss?: number,
  action: 'BUY' | 'SELL', // use for modifications
  analitics?: any,
};