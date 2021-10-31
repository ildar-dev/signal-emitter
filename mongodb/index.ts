import { MongoClient, Db, Collection, Document } from 'mongodb';
 
// создаем объект MongoClient и передаем ему строку подключения
export const mongoClient = new MongoClient("mongodb://localhost:27017/");

export const DB_NAME = 'ibkr';

export const connect = async (func: (db: Db, client: MongoClient) => Promise<void>, connectedClient: MongoClient | undefined = undefined) => {
  if (connectedClient) {
    try {
      await func(mongoClient.db(DB_NAME), connectedClient);
    } catch (error) {
      console.error(error)
    }
  } else {
    try {
      await mongoClient.connect();
      await func(mongoClient.db(DB_NAME), mongoClient);
    } catch (error) {
      console.error(error)
    } finally {
      await mongoClient.close();
    }
  }
};

export const createCollectionIfNotExist = async (colName: string, client: MongoClient) => {
  await connect(async (db) => {
    const collections =  await db.collections();

    if (!collections.find((col: Collection<Document>) => col.collectionName === colName)) {
      db.createCollection(colName);
    }
  }, client);
};
