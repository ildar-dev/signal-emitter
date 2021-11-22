import { MongoClient, Db } from 'mongodb';
 
// создаем объект MongoClient и передаем ему строку подключения
export const mongoClient = new MongoClient("mongodb://localhost:27017/");

const DB_NAME = 'ibkr';

export const db = mongoClient.db(DB_NAME);
