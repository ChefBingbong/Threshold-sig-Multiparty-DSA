import Validator from "../p2p/validators/validator";
import ChainUtil from "../utils/chainUtil";
import { ErrorWithCode, ProtocolError } from "../utils/errors";

export type TransactonInput = { timestamp: number; from: string; signature: string };
export type TransactonOutput<T extends any> = { to: string; amount: T; fee: number };

export interface BaseTransactionInterface<T> {
      signTransaction(transaction: Transaction<any>, senderWallet: any): void;
}
class Transaction<T extends any> implements BaseTransactionInterface<T> {
      public id: string;
      public from: string;
      public input: any;
      public output: TransactonOutput<T> | null;
      public hash: string;
      public signature: string;
      public override: boolean | undefined;

      constructor(data: any, validator: Validator) {
            this.id = ChainUtil.id();
            this.from = validator.publicKey;
            this.input = { data: data, timestamp: Date.now() };
            this.hash = ChainUtil.hash(this.input);
            this.signature = validator.sign(this.hash);
            this.override = data.override;
      }

      public static newTransaction<DataFormat extends any>(
            senderWallet: any,
            to: string,
            amount: DataFormat,
            type: string,
            override?: boolean
      ): Transaction<DataFormat> | undefined {
            return this.generateTransaction<DataFormat>(senderWallet, to, amount, type, override);
      }

      private static generateTransaction<DataFormat extends any>(
            senderWallet: any,
            to: string,
            amount: DataFormat,
            type: string,
            override?: boolean
      ): Transaction<DataFormat> | undefined {
            try {
                  const transaction = new Transaction<DataFormat>({ to, amount, type, override }, senderWallet);
                  if (!transaction) {
                        throw new ErrorWithCode(
                              `Errored interbnally: Failed to generate transaction`,
                              ProtocolError.INTERNAL_ERROR
                        );
                  }

                  // this.signTransaction(transaction, senderWallet);
                  return transaction;
            } catch (error) {
                  console.error(error);
                  return undefined;
            }
      }

      public signTransaction(transaction: Transaction<any>, senderWallet: any): void {
            transaction.input = {
                  timestamp: Date.now(),
                  from: senderWallet.publicKey,
                  signature: senderWallet.sign(ChainUtil.hash(transaction.output)),
            };
      }

      public static verifyTransaction(transaction: Transaction<any>): boolean {
            return ChainUtil.verifySignature(
                  transaction.from,
                  transaction.signature,
                  ChainUtil.hash(transaction.input)
            );
      }
}

export default Transaction;
