import { IBApi, EventName, Position, ErrorCode, Contract, OrderType, SecType, Order, OrderAction, Forex, IBApiNext, AccountPositionsUpdate } from "@stoqey/ib";
import { TMessage } from './types';

import { connect } from './mongodb';

import { takeUntil, Subject, first, lastValueFrom, firstValueFrom, Subscription } from 'rxjs';

const ib = new IBApiNext({
  // clientId: 0,
  host: '127.0.0.1',
  port: 7497,
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let positions: AccountPositionsUpdate;

let positionsSubscription = ib.getPositions().subscribe(_ => positions = _);

const CURRENCY = 'USD';

const ACCOUNT_ID = 'kamilla11';


const handler = async (message: TMessage) => {
  console.log(ib.isConnected);
  if (message.type === 'BUY') {
    console.log('buy');
    const split = message.ticker.split('.');
    const contract: Contract = {
      secType: SecType.CASH,
      currency: split[1],
      symbol: split[0],
      exchange: 'IDEALPRO',
    }

    const order: Order = {
      orderType: message.typeContract === 'LIMIT' ? OrderType.LMT : OrderType.MKT,
      action: OrderAction.BUY,
      lmtPrice: message.typeContract === 'LIMIT' ? message.price : undefined,
      totalQuantity: 100,
      account: ACCOUNT_ID,
      hedgeType: 'B',
    };


    const orderId = await ib.placeNewOrder(contract, order);


    // save to collection(channelId) orderId > messageOrderId
    await connect(async (db) => {
      await db.collection(message.channelId).insertOne({
        orderId,
        orderIdMessage: message.orderId,
        data: Date.now,
      })
    })

    return;
  }

  /* SELL ORDER
    {
      ticker: 'EURUSD',
      type: 'SELL',
      typeContract: 'LIMIT',
      price: 10.23,
    }
  */

  if (message.type === 'SELL' || message.type === 'CLOSE') {
    const contract: Forex = new Forex(message.ticker, CURRENCY);

    const orderId = await ib.getNextValidOrderId();

    const order: Order = {
      orderType: OrderType.LMT,
      action: OrderAction.SELL,
      lmtPrice: message.price,
      orderId,
      totalQuantity: 1,
      account: ACCOUNT_ID,
      hedgeType: 'B',
    };

    ib.placeOrder(orderId, contract, order);
    return;
  }

  if (message.type === 'MODIFICATION') {
    const contract: Forex = new Forex(message.ticker, CURRENCY);

    const orderId = await ib.getNextValidOrderId();

    const order: Order = {
      orderType: OrderType.STP_LMT,
      action: OrderAction.SELL,
      lmtPrice: message.price,
      orderId,
      totalQuantity: 1,
      account: ACCOUNT_ID,
    };
  }

};

ib.connect();

sleep(1000)
.then(async _ =>
await handler(
  {
    messageId: 0,
    orderId: 0,
    channelId: 'Tested',
    ticker: 'EUR.CHF',
    type: 'BUY',
    typeContract: 'MARKET',
    price: 0.8,
  }
))
.then(_ =>  
  {
    console.log(ib.isConnected);
    positionsSubscription.unsubscribe();
    ib.disconnect();
    console.log(Array.from(positions.all.values()).flat().map(_ => _));
  }
);

// secType CASH
// conId: 12087792,
// symbol: 'EUR',
// secType: 'CASH',
// lastTradeDateOrContractMonth: '',
// strike: 0,
// right: undefined,
// multiplier: 0,
// exchange: '',
// currency: 'USD',
// localSymbol: 'EUR.USD',
// tradingClass: 'EUR.USD'
