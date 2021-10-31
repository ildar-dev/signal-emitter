import { IBApi, EventName, ErrorCode, Contract, OrderType, SecType, Order, OrderAction, Forex } from "@stoqey/ib";

import { connect, createCollectionIfNotExist } from './mongodb';



const CURRENCY = 'USD';

const ACCOUNT_ID = 'kamilla11';

const TOTAL = 2000;;

const EACH_ORDER = 0.005;

const TOTAL_QUANTITY = Math.ceil(TOTAL * EACH_ORDER);

// create IBApi object

const ib = new IBApi({
  // clientId: 0,
  host: '127.0.0.1',
  port: 7497,
});

type TMessage = {
  messageId: number,
  orderId: number,
  canallId: string,
  ticker: string,
  type: 'BUY' | 'SELL' | 'CLOSE' | 'MODIFICATION',
  typeContract: 'MARKET' | 'LIMIT',
  price: number,
  takeProfit: number,
  stopLoss: number,
  analitics: any,
};

const handler = (message: TMessage) => {
  /* OPEN / BUY ORDER
    {
      ticker: 'EURUSD',
      type: 'BUY',
      typeContract: 'LIMIT',
      price: 10.23,
    }
  */
  if (message.type === 'BUY') {
    ib.once(EventName.nextValidId, (orderId: number) => {
      const contract: Forex = new Forex(message.ticker, CURRENCY);

      const order: Order = {
        orderType: OrderType.LMT,
        action: OrderAction.BUY,
        lmtPrice: message.price,
        orderId,
        totalQuantity: TOTAL_QUANTITY,
        account: ACCOUNT_ID,
      };

      // save to collection(R2BC) orderId > messageOrderId
      connect(async (db) => {
        db.collection(message.canallId).insertOne({
          orderId,
          orderIdMessage: message.orderId,
        })
      })

      ib.placeOrder(orderId, contract, order);
    });
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

  if (message.type === 'SELL') {
    ib.once(EventName.nextValidId, (orderId: number) => {
      const contract: Forex = new Forex(message.ticker, CURRENCY);

      const order: Order = {
        orderType: OrderType.LMT,
        action: OrderAction.BUY,
        lmtPrice: message.price,
        orderId,
        totalQuantity: TOTAL_QUANTITY,
        account: ACCOUNT_ID,
      };
      // вот здесь нужно сохранить в базу данных message.orderId => orderId

      ib.placeOrder(orderId, contract, order);
    });
    return;
  }

};

let positionsCount = 0;

// ib.on(EventName.error, (err: Error, code: ErrorCode, reqId: number) => {
//   console.error(`${err.message} - code: ${code} - reqId: ${reqId}`);
// })
//   .on(
//     EventName.position,
//     (account: string, contract: Contract, pos: number, avgCost?: number) => {
//       console.log(`${account}: ${pos} x ${contract.symbol} @ ${avgCost}`);
//       positionsCount++;
//     }
//   )
//   .once(EventName.positionEnd, () => {
//     console.log(`Total: ${positionsCount} positions.`);
//     ib.disconnect();
//   });

// // call API functions

// console.log('alo');

// ib.connect();

// ib.reqPositions();
