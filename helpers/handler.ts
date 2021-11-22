import { Contract, OrderType, Order, OrderAction, IBApiNext, SecType } from '@stoqey/ib';
import { TMessage, EAction, ETypeContract, EOrderType, TDocumentOrder } from '../types';
import { connect } from '../mongodb';
import { Logger } from '../logger';

const TOTAL_QUANTITY = 20000;

const preOrder: Order = {
  totalQuantity: TOTAL_QUANTITY,
  transmit: true,
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getContract = (message: TMessage) => { 
  const split = message.ticker.split('.');
  return {
    secType: SecType.CASH,
    currency: split[1],
    symbol: split[0],
    exchange: 'IDEALPRO',
  } as Contract;
};

export const getOrderType = (contractType: ETypeContract) => contractType === ETypeContract.LIMIT ? OrderType.LMT : OrderType.MKT;

export const getWrappedAction = (action: EAction) => action === EAction.BUY ? OrderAction.SELL : OrderAction.BUY;

export const getAction = (action: EAction) => action === EAction.BUY ? OrderAction.BUY : OrderAction.SELL;

export const getTakeProfitOrder = (message: TMessage): Order => ({
  ... preOrder,
  orderType: OrderType.LMT,
  action: getWrappedAction(message.action),
  lmtPrice: message.takeProfit,
});

export const getStopLossOrder = (message: TMessage): Order => ({
  ... preOrder,
  orderType: OrderType.STP,
  action: getWrappedAction(message.action),
  auxPrice: message.stopLoss,
});

export const getOpenOrder = (message: TMessage): Order => ({
  ... preOrder,
  orderType: getOrderType(message.contractType),
  action: getAction(message.action),
  lmtPrice: message.contractType === ETypeContract.LIMIT ? message.price : undefined,
})

export const modificatePendingOrder = async (orderType: EOrderType, message: TMessage, logger: Logger, ib: IBApiNext, contract: Contract) => {
  const modificatedOrderId = await connect(async (db) => {
    const document = await db.collection(message.channelId).findOneAndDelete({ orderType, orderIdMessage: message.orderId });
    return document.value?.orderId as number
  })

  logger.add(`MODIFICATED ${orderType} ID`, modificatedOrderId);

  if (modificatedOrderId) {
    ib.cancelOrder(modificatedOrderId);
    logger.add('DELETE', modificatedOrderId);
    const order = (orderType === EOrderType.TAKEPROFIT ? getTakeProfitOrder : getStopLossOrder)(message);

    const orderId = await ib.placeNewOrder(contract, order);
    await connect(async (db) => await db.collection(message.channelId).insertOne(getDocument(orderId, orderType, message)));
  } else {
    logger.error(`TRY MODIFY ${orderType} WITHOUT PARENT`);
  }
}

export const openPendingOrder = async (orderType: EOrderType, message: TMessage, logger: Logger, ib: IBApiNext, contract: Contract): Promise<TDocumentOrder> => {
  logger.add(`${orderType} OPEN`);
    
  const order = (orderType === EOrderType.TAKEPROFIT ? getTakeProfitOrder : getStopLossOrder)(message);

  const orderId = await ib.placeNewOrder(contract, order);

  return getDocument(orderId, orderType, message);
}

export const getCloseOrder = (message: TMessage): Order => ({
  ... preOrder,
  orderType: OrderType.MKT,
  action: getWrappedAction(message.action),
})

export const getDocument = (orderId: number, orderType: EOrderType, message: TMessage): TDocumentOrder => ({
  orderId,
  orderType,
  orderIdMessage: message.orderId,
  date: Date.now(),
  message,
});
