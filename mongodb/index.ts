import { MongoClient } from 'mongodb';
 
// создаем объект MongoClient и передаем ему строку подключения
export const mongoClient = new MongoClient("mongodb://localhost:27017/");

mongoClient.connect().then(_ => {
  console.log('MONGO CONNECTED');
 })
 .catch(_ => {
   console.error('MONGO ERR', _);
 });

const DB_NAME = 'ibkr';

export const db = mongoClient.db(DB_NAME);
