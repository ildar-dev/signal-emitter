"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
//@ts-nocheck
const ib_tws_api_1 = require("ib-tws-api");
function run() {
    return __awaiter(this, void 0, void 0, function* () {
        let api = new ib_tws_api_1.Client({
            host: '127.0.0.1',
            port: 4001
        });
        let order1 = yield api.placeOrder({
            contract: ib_tws_api_1.Contract.stock('AAPL'),
            order: ib_tws_api_1.Order.limit({
                action: 'BUY',
                totalQuantity: 1,
                lmtPrice: 0.01
            })
        });
        let order2 = yield api.placeOrder({
            contract: ib_tws_api_1.Contract.stock('GOOG'),
            order: ib_tws_api_1.Order.limit({
                action: 'SELL',
                totalQuantity: 1,
                lmtPrice: 9999
            })
        });
        // Check open orders
        //api.reqGlobalCancel();
        console.log('waiting a bit. listen to orderStatus events on production');
        yield new Promise(function (accept, _) {
            setTimeout(function () {
                accept();
            }, 5000);
        });
        let orders = yield api.getAllOpenOrders();
        console.log('Opened orders');
        console.log(orders);
        // Cancel orders after 5 seconds.
        setTimeout(() => __awaiter(this, void 0, void 0, function* () {
            console.log('cancelling');
            let reason1 = yield api.cancelOrder(order1);
            console.log(reason1);
            let reason2 = yield api.cancelOrder(order2);
            console.log(reason2);
            //    ib.reqAllOpenOrders();
        }), 5000);
    });
}
run()
    .then(() => {
})
    .catch((e) => {
    console.log('failure');
    console.log(e);
    process.exit();
});
//# sourceMappingURL=index.js.map