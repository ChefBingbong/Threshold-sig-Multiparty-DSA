import { randBetween } from "bigint-crypto-utils";
import { Exponent } from "../math/polynomial/exponent";
import { generateElGamalKeyPair } from "../math/sample";
import { randomPaillierPrimes } from "../paillierKeyPair/paillierCryptoUtils";
import { PaillierSecretKey } from "../paillierKeyPair/paillierKeygen";
import { zkSchCreateRandomness } from "../zk/zksch";
import { AbstractKeygenRound } from "./abstractRound";
import { KeygenBroadcastForRound2 } from "./keygenMessages/broadcasts";
import { partyIdToScalar } from "./partyKey";
import { KeygenInputForRound2, KeygenRound1Output, KeygenBroadcastForRound2JSON } from "./types";
import { validatePaillierPrime } from "../paillierKeyPair/paillierBackup";

export class KeygenRound1 extends AbstractKeygenRound {
      public output: KeygenInputForRound2;
      constructor() {
            super({ isBroadcastRound: true, isDriectMessageRound: false, currentRound: 1 });
      }

      public handleBroadcastMessage(bmsg: any): void {}
      public handleDirectMessage(bmsg: any): void {}

      public async process(): Promise<KeygenRound1Output> {
            // generate large random primes and use these to create a paillier keypair
            try {
                  let paillierSecret: PaillierSecretKey;
                  if (this.input.precomputedPaillierPrimes) {
                        const { p, q } = this.input.precomputedPaillierPrimes;
                        await validatePaillierPrime(p);
                        await validatePaillierPrime(q);
                        paillierSecret = PaillierSecretKey.fromPrimes(p, q);
                  } else {
                        const { p, q } = await randomPaillierPrimes();
                        paillierSecret = PaillierSecretKey.fromPrimes(p, q);
                  }

                  // a pedersen commit is used to add extra security with the
                  // paillier key pair
                  const selfPaillierPublic = paillierSecret.publicKey;
                  const { pedersen: selfPedersenPublic, lambda: pedersenSecret } =
                        paillierSecret.generatePedersen();

                  const [elGamalSecret, elGamalPublic] = generateElGamalKeyPair();

                  const selfShare = this.session.output.vssSecret.evaluate(partyIdToScalar(this.session.selfId));

                  const selfVSSpolynomial = Exponent.fromPoly(this.session.output.vssSecret);

                  // here we create randomness for a schnorr ZKP which
                  // is used later for round proofs
                  const schnorrRand = zkSchCreateRandomness();

                  const selfRID = randBetween(2n ** 256n);
                  const chainKey = randBetween(2n ** 256n);

                  const { commitment: selfCommitment, decommitment } = this.session
                        .cloneHashForId(this.session.selfId)
                        .commit([
                              selfRID,
                              chainKey,
                              selfVSSpolynomial,
                              schnorrRand.commitment.C,
                              elGamalPublic,
                              selfPedersenPublic,
                        ]);

                  //broadcast results to other parties
                  const broadcasts: KeygenBroadcastForRound2JSON = new KeygenBroadcastForRound2(
                        this.session.selfId,
                        selfCommitment
                  ).toJSON();

                  this.output = {
                        inputRound1: this.input,
                        selfVSSpolynomial,
                        selfCommitment,
                        selfRID,
                        chainKey,
                        selfShare,
                        elGamalPublic,
                        selfPaillierPublic,
                        selfPedersenPublic,
                        elGamalSecret,
                        paillierSecret,
                        pedersenSecret,
                        schnorrRand,
                        decommitment,
                  };
                  return {
                        broadcasts,
                        // @ts-ignore
                        inputForRound2: this.output,
                  };
            } catch (error) {
                  console.log(error);
            }
      }
}
