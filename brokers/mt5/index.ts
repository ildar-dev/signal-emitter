import { THandler, TBroker, TStarter, TMessage, EType, EAction, ETypeContract } from '../../types';
import { TDocument } from './types';
import { db } from '../../mongodb';
import { Logger, ELogLevel } from '../../logger';
import config from '../../config.json';
import MetaApi, { MetatraderAccount, MetatraderTradeResponse, PendingTradeOptions, StreamingMetaApiConnection } from 'metaapi.cloud-sdk';

const logger = new Logger(ELogLevel.ALL, config.log.hasConsoleOutput, config.log.frequency, config.log.isEnable);

const TOTAL_CASH = 1000;

const token = process.env.TOKEN || 'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI0Zjg4OWMyYjI1MDUzNmVjNTQ0MTBlMDEzNzMwNmViNCIsInBlcm1pc3Npb25zIjpbXSwidG9rZW5JZCI6IjIwMjEwMjEzIiwiaWF0IjoxNjQxNjQ0OTY4LCJyZWFsVXNlcklkIjoiNGY4ODljMmIyNTA1MzZlYzU0NDEwZTAxMzczMDZlYjQifQ.dMQUii-iIwvg7h7hywN373EtJQt3fPf731Ixe9N7U0gF3WOuG5mvKqRYENi9_C8gWznd41aXv14d3ZyLjtIDrGKkHryMREeG66514Zd4VmZJQSTyHWof5glZ39-MyxsIzhIUxAosXhVwmoyt6x2sVOtWs1p0l3-8LO8dnU3Lhp58xFh-gUnLIHwRk1Vvs5JA3Fo8VbS6F285aQRQLTfKSLmYYVUCTgLAQsk6k-rtmYLId3i3Iwxr2zrGJxSBLjcRYQwiWgbHahfh8Jrw1pWbbQInbF0QxysTh8lWKmmWZZTClytdYwtOVZfRuikm7jUezMIVQJFbTVcVd-EQgLCYZQXkdeSoy90rxdyGjiM9jl9m78J2NvLdU6Vg8ibP7YvpPmZQALACsezFKuDdNJMn1CE8VJafzd1Vc64b4R3z7L3kqin3SL8Q2KkD8HwsUHoE-sxDyduU6kzHXYocO14h1eR4DtqrHlBuOGMPHoKA3Bkr7nQygqxFOsC_19n31Hdc3yfqK-aGdSxTo8DibgNv4cQfO9XBcDsW5Zpuw_lvIlsNeoAEMPFvwDDW-psmi7bYeibQFiI3vFzYKuVzmW1-e3EHTGqJ_ee9Tu3djzvM8pgS4htzJuHbyUGEch563Wu1RenhkovM6_ANewHsEpQzqsZ-4ANV2tQdH0qZX9ThVTU';
const login = process.env.LOGIN || '67033143';

const api = new MetaApi(token, {
  retryOpts: {
    minDelayInSeconds: 0.3,
    maxDelayInSeconds: 1,
    retries: 50,
  }
});

let account: MetatraderAccount;
let connection: StreamingMetaApiConnection;

const starter: TStarter = async () => {
  account = await api.metatraderAccountApi.getAccounts({}).then(_ => _.find(a => a.login === login && a.type.startsWith('cloud'))) as MetatraderAccount;
  console.log('Deploying account');
  await account.deploy();
  console.log('Waiting for API server to connect to broker (may take couple of minutes)');
  await account.waitConnected();

  // connect to MetaApi API
  //@ts-ignore
  connection = account.getStreamingConnection();
  await connection.connect();

  // wait until terminal state synchronized to the local state
  console.log('Waiting for SDK to synchronize to terminal state (may take some time depending on your history size)');
  //@ts-ignore
  await connection.waitSynchronized();
  console.log('MT5 READY');
}

const handler: THandler = async (message: TMessage) => {
  const timeStart = performance.now();
  const logOrderId = message.orderId;
  const collection = db.collection(message.channelId + '_MT5');
  const ticker = message.ticker.split('.').join('');
  const TOTAL_QUANTITY = 0.01;
  // Math.ceil(TOTAL_CASH * (message.percentage / 100));
  switch (message.type) {
    case EType.OPEN: {
      const options: PendingTradeOptions = {
        comment: `${message.price} : ${message.orderId}`,
      };

      const order = message.contractType === ETypeContract.MARKET
      ? await connection[message.action === EAction.BUY ? 'createMarketBuyOrder' : 'createMarketSellOrder'](ticker, TOTAL_QUANTITY, message.stopLoss, message.takeProfit, options)
      : await connection[message.action === EAction.BUY ? 'createLimitBuyOrder' : 'createLimitSellOrder'](ticker, TOTAL_QUANTITY, message.price, message.stopLoss, message.takeProfit, options)

      logger.add(logOrderId, 'OPEN', order);

      await collection.insertOne({
        orderMessageId: message.orderId,
        order,
      } as TDocument);
      break;
    }
    case EType.MODIFICATION: {
      const document = await collection.findOne({ orderMessageId: message.orderId }) as TDocument;
      if (!document?.order?.positionId) {
        logger.error(logOrderId, 'TRY MODIFICATE WITHOUT OPEN');
      }
      let order: MetatraderTradeResponse | null = null;
      try {
        order = await connection.modifyPosition(document.order.positionId, message.stopLoss, message.takeProfit); // modificate
      } catch(error) {
        console.error(error);
        logger.add(logOrderId, 'MODIFICATE PENDING ORDER', { document });
        order = await connection.modifyOrder(document.order.orderId, message.price, message.stopLoss, message.takeProfit);
      }
      logger.add(logOrderId, 'MODIFICATE', { document, order });
      await collection.findOneAndUpdate({ orderMessageId: message.orderId }, { order }); // update info about order in mongo
      break;
    }
    case EType.CLOSE: {
      const document = await collection.findOne({ orderMessageId: message.orderId }) as TDocument;
      if (!document?.order?.positionId) {
        logger.error(logOrderId, 'TRY CLOSE WITHOUT OPEN');
      }
      let order: MetatraderTradeResponse | null = null;
      try {
        order = await connection.closePosition(document.order.positionId, {
          comment: `CLOSE price: ${message.price}; TP: ${message.takeProfit}; SL: ${message.stopLoss}`
        }); // modificate
      } catch(error) {
        console.error(error);
        logger.add(logOrderId, 'CLOSE PENDING ORDER', { document });
        order = await connection.cancelOrder(document.order.orderId);
      }
      logger.add(logOrderId, 'MODIFICATE', { document, order });
      break;
    }
  }

  const timeFinish = performance.now();
  
  logger.add(logOrderId, 'HANDLE EXECUTION', (timeFinish - timeStart).toFixed(2));
};

export default {
  starter,
  handler,
} as TBroker;
