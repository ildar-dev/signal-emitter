import { THandler, TBroker, TStarter, TMessage, EType, EAction, ETypeContract } from '../../types';
import { TDocument } from './types';
import { db } from '../../mongodb';
import { Logger, errorSerializer, ELogLevel } from '../../logger';
import config from '../../config.json';
import MetaApi, { MetatraderAccount, MetatraderTradeResponse, PendingTradeOptions, StreamingMetaApiConnection } from 'metaapi.cloud-sdk';
import { exit } from 'process';

const logger = new Logger(ELogLevel.ALL, config.log.hasConsoleOutput, config.log.frequency, config.log.isEnable);

const token = process.env.MT5_TOKEN as string;
const login = process.env.MT5_LOGIN as string;

if (!token || !login) {
  console.error('❌ .env does not contain MT5_TOKEN or MT5_LOGIN');
  exit(0);
}

const api = new MetaApi(token, {
  requestTimeout: 0.2,
  connectTimeout: 0.2,
  packetOrderingTimeout: 0.2,
  retryOpts: {
    minDelayInSeconds: 0.5,
    maxDelayInSeconds: 30,
    retries: 50,
  }
});

let account: MetatraderAccount;
let connection: StreamingMetaApiConnection;

const starter: TStarter = async () => {
  account = await api.metatraderAccountApi.getAccounts({}).then(_ => _.find(a => a.login === login && a.type.startsWith('cloud'))) as MetatraderAccount;
  console.log('✔️ Deploying account');
  await account.deploy();
  console.log('✔️ Waiting for API');
  await account.waitConnected();
  //@ts-ignore
  connection = account.getStreamingConnection();
  await connection.connect();
  console.log('✔️ Waiting for SDK to synchronize');
  //@ts-ignore
  await connection.waitSynchronized();
  console.log('✔️ MT5 READY');
}
/*
Модификация и закрытие сейчас работают с тем учетом, что сигналы присылаются только по маркету
поскольку расчитывем на то, что в опен-документе будет positionId
*/
const handler: THandler = async (message: TMessage) => {
  const timeStart = performance.now();
  const orderId = message.orderId;
  const collection = db.collection(message.channelId + '_MT5');
  const ticker = message.ticker.split('.').join('');
  const TOTAL_QUANTITY = 0.01;
  switch (message.type) {
    case EType.OPEN: {
      const options: PendingTradeOptions = {
        comment: `${message.price} : ${orderId}`,
      };

      const order: any = message.contractType === ETypeContract.MARKET
      ? await connection[message.action === EAction.BUY ? 'createMarketBuyOrder' : 'createMarketSellOrder'](ticker, TOTAL_QUANTITY, message.stopLoss, message.takeProfit, options)
      : await connection[message.action === EAction.BUY ? 'createLimitBuyOrder' : 'createLimitSellOrder'](ticker, TOTAL_QUANTITY, message.price, message.stopLoss, message.takeProfit, options)

      await collection.insertOne({
        orderMessageId: orderId,
        order,
      } as TDocument);

      logger.add(message, 'OPEN', order);
      break;
    }
    case EType.MODIFICATION: {
      let document: TDocument;
      try {
        document = await collection.findOne({ orderMessageId: orderId }) as TDocument;
      } catch (error) {
        logger.error(message, `NOT EXIST ${orderId}`, errorSerializer(error));
        break;
      }
      if (!document?.order) {
        logger.error(message, 'TRY MODIFICATE without open', null);
        break;
      }
      let order: MetatraderTradeResponse | null = null;
      try {
        order = await connection.modifyPosition(document!.order.positionId, message.stopLoss, message.takeProfit); // modificate
        logger.add(message, 'MODIFICATE position', null, `*#pos${document.order.positionId}*`);
      } catch(error) {
        order = await connection.modifyOrder(document.order.orderId, message.price, message.stopLoss, message.takeProfit);
        logger.add(message, 'MODIFICATE order', null);
      }
      await collection.findOneAndUpdate({ orderMessageId: orderId }, { order }); // update info about order in mongo
      break;
    }
    case EType.CLOSE: {
      let document: TDocument;
      try {
        document = await collection.findOne({ orderMessageId: orderId }) as TDocument;
      } catch (error) {
        logger.error(message, `NOT EXIST ${orderId}`, errorSerializer(error));
        break;
      }
      if (!document?.order) {
        logger.error(message, 'TRY CLOSE without open');
        break;
      }
      let order: MetatraderTradeResponse | null = null;
      try {
        order = await connection.closePosition(document.order.positionId, {});
        logger.add(message, 'CLOSE position', order, `*#pos${document.order.positionId}*`);
      } catch(error) {
        order = await connection.cancelOrder(document.order.orderId);
        logger.add(message, 'CLOSE (cancel) order');
      }
      break;
    }
  }

  const timeFinish = performance.now();
  
  logger.add(message, 'TIME', (timeFinish - timeStart).toFixed(2));
};

export default {
  starter,
  handler,
} as TBroker;