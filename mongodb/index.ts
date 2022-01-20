import { MongoClient } from 'mongodb';
import { errorSerializer } from '../logger';
 
// создаем объект MongoClient и передаем ему строку подключения
export const mongoClient = new MongoClient("mongodb://localhost:27017/");

mongoClient.connect().then(() => {
  console.log('✔️ MongoDB connected 🥭');
 })
 .catch((error) => {
   console.error('❌ MongoDB failed 🥭', errorSerializer(error));
 });

const DB_NAME = 'ibkr';

export const db = mongoClient.db(DB_NAME);
