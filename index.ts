import { IBApi, EventName, Position, ErrorCode, Contract, OrderType, SecType, Order, OrderAction, Forex, IBApiNext, AccountPositionsUpdate, ConnectionState } from "@stoqey/ib";
import { TMessage } from './types';

import { connect } from './mongodb';

import { takeUntil, Subject, first, lastValueFrom, takeWhile, firstValueFrom, Subscription } from 'rxjs';

const ib = new IBApiNext({
  host: '127.0.0.1',
  port: 7497,
});

ib.error.subscribe((error) => {
  console.error('error,', `${error.error.message}`);
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const waitConnection = async () => {
  const s = ib.connectionState.pipe(takeWhile(c => c !== ConnectionState.Connected, true));
  s.subscribe(_ => { console.log(_, 'check') });
  return await lastValueFrom(s);
}

let positions: Partial<AccountPositionsUpdate> = {};

const positionsSubscription = ib.getPositions().subscribe(_ => positions = _);


const CURRENCY = 'USD';

const TOTAL_QUANTITY = 10000;

const ACCOUNT_ID = 'kamilla11';


const handler = async (message: TMessage) => {
  const timeStart = performance.now;
  console.log('handler', ib.isConnected);
  const split = message.ticker.split('.');
  const contract: Contract = {
    secType: SecType.CASH,
    currency: split[1],
    symbol: split[0],
    exchange: 'IDEALPRO',
  }
  if (message.type === 'OPEN' && message.price) {
    console.log('OPEN');

    const order: Order = {
      orderType: message.typeContract === 'LIMIT' ? OrderType.LMT : OrderType.MKT,
      action: message.action as OrderAction,
      lmtPrice: message.typeContract === 'LIMIT' ? message.price : undefined,
      totalQuantity: TOTAL_QUANTITY,
      openClose: 'O',
    };


    ib.placeOrder(message.orderId, contract, order);

    await sleep(50);

    // save to collection(channelId) orderId > messageOrderId
    await connect(async (db) => {
      await db.collection(message.channelId).insertOne({
        orderId: message.orderId,
        orderType: 'OPEN',
        orderIdMessage: message.orderId,
        data: Date.now,
        message,
      })
    })
  }

  if (message.type === 'MODIFICATION') {

    if (message.takeProfit) {
      const takeProfitOrderId = await connect(async (db) => {
        const document = await db.collection(message.channelId).findOneAndDelete({ orderType: 'TAKEPROFIT', orderIdMessage: message.orderId });
        return document.value?.orderId as number
      })

      console.log('takeProfitOrderId', takeProfitOrderId);

      if (takeProfitOrderId) {
        const order: Order = {
          orderType: OrderType.LMT,
          action: message.action === 'BUY' ? OrderAction.SELL : OrderAction.BUY, // wrapped action
          lmtPrice: message.takeProfit,
          totalQuantity: TOTAL_QUANTITY,
          openClose: 'O',
        };
        ib.cancelOrder(takeProfitOrderId);
        console.log('delete', takeProfitOrderId);
        await sleep(50);
        const orderId = await ib.placeNewOrder(contract, order);
        await connect(async (db) => {
          await db.collection(message.channelId).insertOne({
            orderId: orderId,
            orderType: 'TAKEPROFIT',
            orderIdMessage: message.orderId,
            data: Date.now,
            message,
          })
        })
      }
    }

    if (message.stopLoss) {
      const stopLossOrderId = await connect(async (db) => {
        const document = await db.collection(message.channelId).findOneAndDelete({ orderType: 'STOPLOSS', orderIdMessage: message.orderId });
        return document.value?.orderId as number
      })

      console.log('stopLossOrderId', stopLossOrderId);

      if (stopLossOrderId) {
        const order: Order = {
          orderType: OrderType.STP,
          auxPrice: message.stopLoss,
          action: message.action === 'BUY' ? OrderAction.SELL : OrderAction.BUY, // wrapped action
          totalQuantity: TOTAL_QUANTITY,
        };
        ib.cancelOrder(stopLossOrderId);
        console.log('delete', stopLossOrderId);
        await sleep(50);
        const orderId = await ib.placeNewOrder(contract, order);
        await connect(async (db) => {
          await db.collection(message.channelId).insertOne({
            orderId: orderId,
            orderType: 'STOPLOSS',
            orderIdMessage: message.orderId,
            data: Date.now,
            message,
          })
        })
      }
    }
  }

  if (message.type === 'CLOSE') {
    const openOrders = (await ib.getAllOpenOrders()).map(_ => _.orderId);

    const orderIds = await connect(async (db) => {
      const query = { $or: [ {orderType: 'STOPLOSS', orderIdMessage: message.orderId }, {orderType: 'TAKEPROFIT', orderIdMessage: message.orderId }] };
      const document = await (db.collection(message.channelId).find({ orderIdMessage: message.orderId })).toArray();
      await db.collection(message.channelId).deleteMany(query);

      return document.map(_ => _.orderId);
    })

    if (orderIds?.every(id => openOrders?.includes(id))) { // true если не закрылся по лимитке (ордер не исполнился)
      const order: Order = {
        orderType: OrderType.LMT,
        action: message.action === 'BUY' ? OrderAction.SELL : OrderAction.BUY,
        lmtPrice: message.price,
        totalQuantity: 1,
        openClose: 'O',
      };
      await ib.placeNewOrder(contract, order);

      const openOrderIdOfClosed = openOrders.filter(value => orderIds.includes(value));

      openOrderIdOfClosed.forEach(i => {
        ib.cancelOrder(i);
      });
    }
  }

  if (message.stopLoss !== undefined && !message.previousStopLoss && message.type === 'OPEN') {
    console.log('STOPLOSS OPEN');

    const order: Order = {
      orderType: OrderType.STP,
      action: (message.action || message.type) === 'BUY' ? OrderAction.SELL : OrderAction.BUY, // wrapped action
      auxPrice: message.stopLoss,
      totalQuantity: TOTAL_QUANTITY,
    };


    const orderId = await ib.placeNewOrder(contract, order);

    console.log(orderId);

    // save to collection(channelId) orderId > messageOrderId
    await connect(async (db) => {
      await db.collection(message.channelId).insertOne({
        orderId,
        orderType: 'STOPLOSS',
        orderIdMessage: message.orderId,
        data: Date.now,
        message,
      })
    })
  }

  if (message.takeProfit !== undefined && !message.previousTakeProfit && message.type === 'OPEN') {
    console.log('TAKEPROFIT OPEN');

    const order: Order = {
      orderType: OrderType.LMT,
      action: (message.action || message.type) === 'BUY' ? OrderAction.SELL : OrderAction.BUY, // wrapped action
      lmtPrice: message.takeProfit,
      totalQuantity: TOTAL_QUANTITY,
      openClose: 'O',
    };

    const orderId = await ib.placeNewOrder(contract, order);
    console.log(orderId);

    // save to collection(channelId) orderId > messageOrderId
    await connect(async (db) => {
      await db.collection(message.channelId).insertOne({
        orderId,
        orderType: 'TAKEPROFIT',
        orderIdMessage: message.orderId,
        data: Date.now,
        message,
      })
    })
  }

  const timeFinish = performance.now;
  // @todo send to mongodb execution time
};
ib.connect(0);

try {
sleep(1000)
.then(() =>
  waitConnection())
.then(async _ => {
await sleep(50);
await handler(
  {
    messageId: 0,
    orderId: 1000,
    channelId: 'TESTv6',
    ticker: 'EUR.CHF',
    action: 'BUY',
    type: 'MODIFICATION',
    typeContract: 'LIMIT',
    price: 1,
    takeProfit: 20,
  }
)
})
.then(async _ =>  
  {
    console.log(ib.isConnected);
    // console.log(Array.from((positions as AccountPositionsUpdate).all?.values()).flat().map(_ => _));
    ib.disconnect();
    console.log('disconnected', ib.isConnected)
  }
)
.then(async _ => {
connect(async (db) => {
  const t = await db.collection('TESTv5').findOne({ orderType: 'TAKEPROFIT', orderId: 10});
  console.log('TRY', t);
  return ;
})
})
} catch(error) {
  console.error('error', error, ib.isConnected);
  ib.disconnect();
}

