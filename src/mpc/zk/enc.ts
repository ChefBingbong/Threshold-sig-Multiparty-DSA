import { modMultiply, modPow } from "bigint-crypto-utils";

import Fn from "../math/polynomial/Fn";
import { isValidModN, isInIntervalLeps } from "../math/arith";
import { paillierAdd, paillierMultiply, PaillierPublicKey } from "../paillierKeyPair/paillierKeygen";
// import { PaillierPublicKey } from "../paillierKeyPair/paillierPublicKey";
import { PedersenParams } from "../paillierKeyPair/Pedersen/pendersen";
import { sampleUnitModN, sampleIntervalLeps, sampleIntervalLN, sampleIntervalLepsN } from "../math/sample";
import { Hasher } from "../utils/hasher";

export type ZkEncPublic = {
      K: bigint; // Paillier ciphertext
      prover: PaillierPublicKey;
      aux: PedersenParams;
};

export type ZkEncPrivate = {
      k: bigint;
      rho: bigint;
};

export type ZkEncCommitment = {
      S: bigint;
      A: bigint; // Paillier ciphertext
      C: bigint;
};

export type ZkEncProofJSON = {
      commitment: {
            Sdec: string;
            Adec: string;
            Cdec: string;
      };
      Z1dec: string;
      Z2dec: string;
      Z3dec: string;
};

export class ZkEncProof {
      public readonly commitment: ZkEncCommitment;
      public readonly Z1: bigint;
      public readonly Z2: bigint;
      public readonly Z3: bigint;

      private constructor(commitment: ZkEncCommitment, Z1: bigint, Z2: bigint, Z3: bigint) {
            this.commitment = commitment;
            this.Z1 = Z1;
            this.Z2 = Z2;
            this.Z3 = Z3;
      }

      public static from({
            commitment,
            Z1,
            Z2,
            Z3,
      }: {
            commitment: ZkEncCommitment;
            Z1: bigint;
            Z2: bigint;
            Z3: bigint;
      }): ZkEncProof {
            const proof = new ZkEncProof(commitment, Z1, Z2, Z3);
            Object.freeze(proof);
            return proof;
      }

      public static fromJSON(json: ZkEncProofJSON): ZkEncProof {
            return ZkEncProof.from({
                  commitment: {
                        S: BigInt(json.commitment.Sdec),
                        A: BigInt(json.commitment.Adec),
                        C: BigInt(json.commitment.Cdec),
                  },
                  Z1: BigInt(json.Z1dec),
                  Z2: BigInt(json.Z2dec),
                  Z3: BigInt(json.Z3dec),
            });
      }

      public toJSON(): ZkEncProofJSON {
            return {
                  commitment: {
                        Sdec: this.commitment.S.toString(10),
                        Adec: this.commitment.A.toString(10),
                        Cdec: this.commitment.C.toString(10),
                  },
                  Z1dec: this.Z1.toString(10),
                  Z2dec: this.Z2.toString(10),
                  Z3dec: this.Z3.toString(10),
            };
      }
}

export type ZkEncProofSerialized = {
      commitment: {
            Shex: string;
            Ahex: string;
            Chex: string;
      };
      Z1signedHex: string;
      Z2hex: string;
      Z3signedHex: string;
};

export const zkEncSerializeProof = (proof: ZkEncProof): ZkEncProofSerialized => {
      return {
            commitment: {
                  Shex: proof.commitment.S.toString(16),
                  Ahex: proof.commitment.A.toString(16),
                  Chex: proof.commitment.C.toString(16),
            },
            Z1signedHex: proof.Z1.toString(16),
            Z2hex: proof.Z2.toString(16),
            Z3signedHex: proof.Z3.toString(16),
      };
};

export const zkEncCreateProof = (pub: ZkEncPublic, priv: ZkEncPrivate, hasher: Hasher): ZkEncProof => {
      const alpha = sampleIntervalLeps();
      const r = sampleUnitModN(pub.prover.n);
      const mu = sampleIntervalLN();
      const gamma = sampleIntervalLepsN();

      const A = pub.prover.encryptWithNonce(alpha, r);

      const commitment: ZkEncCommitment = {
            S: pub.aux.commit(priv.k, mu),
            A,
            C: pub.aux.commit(alpha, gamma),
      };

      const e = challenge(pub, commitment, hasher);

      const Z1 = priv.k * e + alpha;
      const Z2 = modMultiply([modPow(priv.rho, e, pub.prover.n), r], pub.prover.n);
      const Z3 = e * mu + gamma;

      return ZkEncProof.from({ commitment, Z1, Z2, Z3 });
};

export const zkEncVerifyProof = (proof: ZkEncProof, pub: ZkEncPublic, hasher: Hasher): boolean => {
      if (!zkEncIsPublicValid(proof, pub)) {
            return false;
      }
      if (!isInIntervalLeps(proof.Z1)) {
            return false;
      }

      const e = challenge(pub, proof.commitment, hasher);
      if (!pub.aux.verify(proof.Z1, proof.Z3, e, proof.commitment.C, proof.commitment.S)) {
            return false;
      }

      const lhs = pub.prover.encryptWithNonce(proof.Z1, proof.Z2);
      const rhs = paillierAdd(pub.prover, paillierMultiply(pub.prover, pub.K, e), proof.commitment.A);

      return lhs === rhs;
};

export const zkEncIsPublicValid = (proof: ZkEncProof, pub: ZkEncPublic): boolean => {
      if (!proof) {
            return false;
      }
      if (!pub.prover.validateCiphertext(proof.commitment.A)) {
            return false;
      }
      if (!isValidModN(pub.prover.n, proof.Z2)) {
            return false;
      }
      return true;
};

const challenge = (pub: ZkEncPublic, commitment: ZkEncCommitment, hasher: Hasher): bigint => {
      const bigHash = hasher
            .updateMulti([pub.aux, pub.prover as any, pub.K, commitment.S, commitment.A, commitment.C])
            .digestBigint();

      const challenge = Fn.sub(bigHash, 2n ** 255n); // TODO

      return challenge;
};
