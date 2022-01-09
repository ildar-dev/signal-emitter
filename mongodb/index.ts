import { MongoClient } from 'mongodb';
 
// создаем объект MongoClient и передаем ему строку подключения
export const mongoClient = new MongoClient("mongodb://localhost:27017/");

mongoClient.connect().then(() => {
  console.log('MONGO CONNECTED');
 })
 .catch((error) => {
   console.error('MONGO ERR', error);
 });

const DB_NAME = 'ibkr';

export const db = mongoClient.db(DB_NAME);
