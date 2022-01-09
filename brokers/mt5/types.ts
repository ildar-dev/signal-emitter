import { MetatraderTradeResponse } from 'metaapi.cloud-sdk';

export type TDocument = {
  orderMessageId: number,
  order: MetatraderTradeResponse
}
