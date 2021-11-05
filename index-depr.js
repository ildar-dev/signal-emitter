import { Client, Contract, Order } from 'ib-tws-api';

// import { connect } from './mongodb';

const mockData = {
  messageId: 12341,
  canallId: 'R2BC',
  orderId: 12,
  ticker: 'EURUSD',
  type: 'BUY',
  typeContract: 'LIMIT',
  price: 40.56,
  takeProfit: null,
  stopLoss: null,
  percentage: 0.5,
  analitics: {},
}

const TOTAL_QUANTITY = 1;


const handler = async (message, ib) => {
  console.log('qq');
  /* OPEN / BUY ORDER
    {
      ticker: 'EURUSD',
      type: 'BUY',
      typeContract: 'LIMIT',
      price: 10.23,
    }
  */
  if (message.type === 'BUY') {
    console.log('buy');
    const contract = Contract.forex(message.ticker);

    console.log(1);

    const order = Order.limit({
      action: message.type,
      lmtPrice: message.price,
      totalQuantity: TOTAL_QUANTITY,
    });

    const orderId = ib.placeOrder(contract, order);

    // save to collection(canallId) orderId > messageOrderId
    // connect(async (db) => {
    //   console.log('db');
    //   await db.collection(message.canallId).insertOne({
    //     orderId,
    //     orderIdMessage: message.orderId,
    //   })
    // })

    console.log('buyed');
    return;
  }
};



async function run() {
  let api = new Client({
    host: '127.0.0.1',
    port: 7497,
    clientId: 0,
  });

  console.log('api',api);

  await handler({
    ticker: 'EURUSD',
    type: 'BUY',
    typeContract: 'LIMIT',
    price: 10.23,
  }, api)

  let orders = await api.getCurrentTime();
  console.log('Opened orders');
  console.log(orders);
}



run()
  .then(() => {
  })
  .catch((e) => {
    console.log('failure');
    console.log(e);
    process.exit();
  });