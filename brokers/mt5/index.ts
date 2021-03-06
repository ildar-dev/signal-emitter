import { THandler, TBroker, TStarter, TMessage, EType, EAction, ETypeContract } from '../../types';
import { TDocument } from './types';
import { db } from '../../mongodb';
import { Logger, errorSerializer, serializer } from '../../logger';
import config from '../../config.json';
import MetaApi, { MetatraderAccount, MetatraderTradeResponse, PendingTradeOptions, StreamingMetaApiConnection } from 'metaapi.cloud-sdk';
import { exit } from 'process';

const token = process.env.MT5_TOKEN as string;
const login = process.env.MT5_LOGIN as string;

if (!token || !login) {
  console.error('❌ .env does not contain MT5_TOKEN or MT5_LOGIN');
  exit(0);
}

const api = new MetaApi(token, {
  requestTimeout: 60,
  connectTimeout: 1,
  packetOrderingTimeout: 1,
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
  if (!account) {
    console.log('✔️ Adding MT5 account to MetaApi');
    const password = process.env.MT5_PASSWORD as string;
    const server = process.env.MT5_SERVER as string;
    // @ts-ignore
    account = await api.metatraderAccountApi.createAccount({
      name: 'Real account',
      type: 'cloud',
      login,
      password,
      server,
      platform: 'mt5',
      application: 'MetaApi',
      magic: 777
    });
  } else {
    console.log('✔️ MT5 account already added to MetaApi', account.id);
  }
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

const handler: THandler = async (messageString: string) => {
  const timeStart = performance.now();
  const logger = new Logger(config.log.hasConsoleOutput, config.log.hasApiOutput, config.log.isEnable);
  let message: TMessage | null = null;
  try {
    message = JSON.parse(messageString);
  } catch(error) {
    logger.error(serializer(errorSerializer(error, true)));
  }
  if (message) {
    try {
      await connection.waitSynchronized({
        intervalInMilliseconds: 250,
        timeoutInSeconds: 60,
      });
      await baseHandler(message, logger);
    } catch(error) {
      logger.error(errorSerializer(error, true));
    }
  }

  const timeFinish = performance.now();
  
  logger.add(`${(timeFinish - timeStart).toFixed(0)} ms`);
  if (logger.hasErrors) {
    logger.add(
    [...
      [
        ...[['restApiHealthy', connection.healthMonitor.serverHealthStatus.restApiHealthy]],
        ...Object.entries(connection.healthMonitor.healthStatus),
      ]
      .map(([key, value]) => `${key === 'message' ? '' : `${key}: `}${typeof value == 'boolean' ? (value ? '✔️' : '❌') : value }`)
      , `uptime hour: ${serializer((connection.healthMonitor.uptime as any)['1h'].toFixed(2))}\n`
    ].join('\n'))
  }
  logger.push(message);
}

const baseHandler = async (message: TMessage, logger: Logger) => {
  const orderId = message.orderId;
  const collection = db.collection(message.channelId + '_MT5');
  const ticker = message.ticker.split('.').join('');
  const TOTAL_QUANTITY = message.lot;
  switch (message.type) {
    case EType.OPEN: {
      const options: PendingTradeOptions = {
        comment: `${message.price} : ${orderId}`,
      };


      const order = message.contractType === ETypeContract.MARKET
      ? await connection[message.action === EAction.BUY ? 'createMarketBuyOrder' : 'createMarketSellOrder'](ticker, TOTAL_QUANTITY, undefined, undefined, options)
      : await connection[message.action === EAction.BUY ? 'createLimitBuyOrder' : 'createLimitSellOrder'](ticker, TOTAL_QUANTITY, message.price, undefined, undefined, options)

      await collection.insertOne({
        orderMessageId: orderId,
        order,
      } as TDocument);

      logger.add(`OPEN ${ticker} ${message.price} ${message.lot}`);
      break;
    }
    case EType.MODIFICATION: {
      let document: TDocument;
      try {
        document = await collection.findOne({ orderMessageId: orderId }) as TDocument;
      } catch (error) {
        logger.error(`MODIFICATE not found`, errorSerializer(error, true));
        break;
      }
      if (!document?.order) {
        logger.error('MODIFICATE without order');
        break;
      }
      let order: MetatraderTradeResponse | null = null;
      try {
        order = await connection.modifyPosition(document!.order.positionId, message.stopLoss, message.takeProfit); // modificate
        logger.add(`MODIFICATE`);
      } catch(error) {
        order = await connection.modifyOrder(document.order.orderId, message.price, message.stopLoss, message.takeProfit);
        logger.add('MODIFICATE order');
      }
      await collection.findOneAndUpdate({ orderMessageId: orderId }, { order }); // update info about order in mongo
      break;
    }
    case EType.CLOSE: {
      let document: TDocument;
      try {
        document = await collection.findOne({ orderMessageId: orderId }) as TDocument;
      } catch (error) {
        logger.error(`CLOSE not found`, errorSerializer(error, true));
        break;
      }
      if (!document?.order) {
        logger.error('CLOSE without order');
        break;
      }
      let order: MetatraderTradeResponse | null = null;
      try {
        order = await connection.closePosition(document.order.positionId, {});
        logger.add(`CLOSE ${ticker} ${message.price}`);
      } catch(error) {
        order = await connection.cancelOrder(document.order.orderId);
        logger.error('CLOSE (cancel) order');
      }
      break;
    }
  }
};

export default {
  starter,
  handler,
} as TBroker;
