import { Client, Contract, Order } from 'ib-tws-api';

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



async function run() {
  let api = new Client({
    host: '127.0.0.1',
    port: 7497
  });

  console.log('api',api);

  let order1 = await api.placeOrder({
    contract: Contract.stock('AAPL'),
    order: Order.limit({
      action: 'BUY',
      totalQuantity: 1,
      lmtPrice: 0.01
    })
  });

  let order2 = await api.placeOrder({
    contract: Contract.stock('GOOG'),
    order: Order.limit({
      action: 'SELL',
      totalQuantity: 1,
      lmtPrice: 9999
    })
  });

  // Check open orders
  //api.reqGlobalCancel();

  console.log('waiting a bit. listen to orderStatus events on production');
  await new Promise(function(accept, _) {
      setTimeout(function() {
          accept();
      }, 5000);
  });

  let orders = await api.getAllOpenOrders();
  console.log('Opened orders');
  console.log(orders);

  // Cancel orders after 5 seconds.
  setTimeout(async () => {
    console.log('cancelling');
    let reason1 = await api.cancelOrder(order1);
    console.log(reason1);

    let reason2 = await api.cancelOrder(order2);
    console.log(reason2);

//    ib.reqAllOpenOrders();
  }, 5000);
}



run()
  .then(() => {
  })
  .catch((e) => {
    console.log('failure');
    console.log(e);
    process.exit();
  });