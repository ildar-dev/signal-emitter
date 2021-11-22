import { MongoClient, Db } from 'mongodb';
 
// создаем объект MongoClient и передаем ему строку подключения
export const mongoClient = new MongoClient("mongodb://localhost:27017/");

export const DB_NAME = 'ibkr';

export const connect = async <T>(func: (db: Db, client: MongoClient) => Promise<T>): Promise<T> => {
  let result: T | null = null;
  try {
    await mongoClient.connect();
    result = await func(mongoClient.db(DB_NAME), mongoClient);
  } catch (error) {
    console.error(error)
  } finally {
    await mongoClient.close();
    return result as T;
  }
};
