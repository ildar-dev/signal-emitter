import { Contract, OrderType, Order, OrderAction, IBApiNext, SecType } from '@stoqey/ib';
import { TMessage, EAction, ETypeContract, EOrderType, TDocumentOrder } from '../types';
import { Logger } from '../logger';
import { Collection } from 'mongodb';

export const CURRENCY = 'USD';

const TOTAL_CASH = 2000; // $

const ORDER_AUTO_EXPIRATION = 1000 * 60 * 60 * 24 * 90; // 90 days

export const formattedDate = (date: Date): string => {
  const month = ('0' + (date.getMonth() + 1)).slice(-2);
  const day  = ('0' + (date.getDate())).slice(-2);
  const year = date.getFullYear();
  const hour =  ('0' + (date.getHours())).slice(-2);
  const min =  ('0' + (date.getMinutes())).slice(-2);
  const sec = ('0' + (date.getSeconds())).slice(-2);
  return `${year}${month}${day} ${hour}:${min}:${sec}`;
};

const goodTillDate = () => {
  const now = new Date().getTime();
  return new Date(now + ORDER_AUTO_EXPIRATION);
}

const totalQuantity = (message: TMessage) => Math.round(TOTAL_CASH * (message.percentage / 100) / message.price);

const preOrder = (message: TMessage): Order => ({
  totalQuantity: totalQuantity(message),
  transmit: true,
  tif: 'GTD',
  goodTillDate: formattedDate(goodTillDate())
});

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getContract = (message: TMessage): Contract => { 
  const split = message.ticker.split('.');
  const isCurrencyPair = split[0] !== 'XAU'; // @todo to channel listener

  return isCurrencyPair 
  ? {
    secType: SecType.CASH,
    currency: split[1],
    symbol: split[0],
    exchange: 'IDEALPRO',
  }
  : {
    secType: SecType.CMDTY,
    currency: split[1],
    symbol: split.join(''),
    exchange: 'SMART',
  } as Contract;
};

export const getOrderType = (contractType: ETypeContract) => contractType === ETypeContract.LIMIT ? OrderType.LMT : OrderType.MKT;

export const getWrappedAction = (action: EAction) => action === EAction.BUY ? OrderAction.SELL : OrderAction.BUY;

export const getAction = (action: EAction) => action === EAction.BUY ? OrderAction.BUY : OrderAction.SELL;

export const getTakeProfitOrder = (message: TMessage): Order => ({
  ... preOrder(message),
  orderType: OrderType.LMT,
  action: getWrappedAction(message.action),
  lmtPrice: message.takeProfit,
});

export const getStopLossOrder = (message: TMessage): Order => ({
  ... preOrder(message),
  orderType: OrderType.STP,
  action: getWrappedAction(message.action),
  auxPrice: message.stopLoss,
});

export const getOpenOrder = (message: TMessage): Order => ({
  ... preOrder(message),
  orderType: getOrderType(message.contractType),
  action: getAction(message.action),
  lmtPrice: message.contractType === ETypeContract.LIMIT ? message.price : undefined,
})

export const modificatePendingOrder = async (orderType: EOrderType.TAKEPROFIT | EOrderType.STOPLOSS, message: TMessage, logger: Logger, ib: IBApiNext, contract: Contract, collection: Collection) => {
  const modificatedOrderId = (await collection.findOneAndDelete({ orderType, orderIdMessage: message.orderId })).value?.orderId as number;
  logger.add(message.orderId, `MODIFICATED ${orderType} ID`, modificatedOrderId);

  if (modificatedOrderId) {
    ib.cancelOrder(modificatedOrderId);
    logger.add(message.orderId, 'DELETE', modificatedOrderId);
    const order = (orderType === EOrderType.TAKEPROFIT ? getTakeProfitOrder : getStopLossOrder)(message);
    const orderId = await ib.placeNewOrder(contract, order);
    await collection.insertOne(getDocument(orderId, orderType, message, order.totalQuantity as number));
  } else {
    logger.error(message.orderId, `TRY MODIFY ${orderType} WITHOUT PREVIOUS`);
  }
}

export const openPendingOrder = async (orderType: EOrderType.TAKEPROFIT | EOrderType.STOPLOSS, message: TMessage, logger: Logger, ib: IBApiNext, contract: Contract): Promise<TDocumentOrder> => {
  logger.add(message.orderId, `${orderType} OPEN`);
    
  const order = (orderType === EOrderType.TAKEPROFIT ? getTakeProfitOrder : getStopLossOrder)(message);

  const orderId = await ib.placeNewOrder(contract, order);

  return getDocument(orderId, orderType, message, order.totalQuantity as number);
}

export const getCloseOrder = (message: TMessage): Order => ({
  ... preOrder(message),
  orderType: OrderType.MKT,
  action: getWrappedAction(message.action),
})

export const getDocument = (orderId: number, orderType: EOrderType, message: TMessage, total: number): TDocumentOrder => ({
  orderId,
  orderType,
  orderIdMessage: message.orderId,
  date: Date.now(),
  total,
  message,
});
