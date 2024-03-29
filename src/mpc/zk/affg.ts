import { secp256k1 } from "@noble/curves/secp256k1";
import { modMultiply, modPow } from "bigint-crypto-utils";

import { isInIntervalLeps, isInIntervalLprimeEps, isValidModN } from "../math/arith";
import { AffinePoint, AffinePointJSON } from "../types";
import { PedersenParams } from "../paillierKeyPair/Pedersen/pendersen";
import { paillierAdd, paillierMultiply, PaillierPublicKey } from "../paillierKeyPair/paillierKeygen";

import {
      sampleIntervalLN,
      sampleIntervalLeps,
      sampleIntervalLepsN,
      sampleIntervalLprimeEps,
      sampleUnitModN,
} from "../math/sample";
import Fn from "../math/polynomial/Fn";
import { Hasher } from "../utils/hasher";
import { isIdentity, pointFromJSON, pointToJSON } from "../math/curve";

export type ZkAffgPublic = {
      Kv: bigint; // ciphertext
      Dv: bigint; // ciphertext
      Fp: bigint; // ciphertext
      Xp: AffinePoint;
      prover: PaillierPublicKey;
      verifier: PaillierPublicKey;
      aux: PedersenParams;
};

export type ZkAffgPrivate = {
      X: bigint;
      Y: bigint;
      S: bigint;
      R: bigint;
};

export type ZkAffgCommitment = {
      A: bigint; // ciphertext
      Bx: AffinePoint;
      By: bigint; // ciphertext
      E: bigint;
      S: bigint;
      F: bigint;
      T: bigint;
};

export type ZkAffgProofJSON = {
      commitment: {
            Adec: string;
            Bx: AffinePointJSON;
            Bydec: string;
            Edec: string;
            Sdec: string;
            Fdec: string;
            Tdec: string;
      };
      Z1dec: string;
      Z2dec: string;
      Z3dec: string;
      Z4dec: string;
      Wdec: string;
      Wydec: string;
};

export class ZkAffgProof {
      public readonly commitment: ZkAffgCommitment;
      public readonly Z1: bigint;
      public readonly Z2: bigint;
      public readonly Z3: bigint;
      public readonly Z4: bigint;
      public readonly W: bigint;
      public readonly Wy: bigint;

      private constructor(
            commitment: ZkAffgCommitment,
            Z1: bigint,
            Z2: bigint,
            Z3: bigint,
            Z4: bigint,
            W: bigint,
            Wy: bigint
      ) {
            this.commitment = commitment;
            this.Z1 = Z1;
            this.Z2 = Z2;
            this.Z3 = Z3;
            this.Z4 = Z4;
            this.W = W;
            this.Wy = Wy;
      }

      public static from({
            commitment,
            Z1,
            Z2,
            Z3,
            Z4,
            W,
            Wy,
      }: {
            commitment: ZkAffgCommitment;
            Z1: bigint;
            Z2: bigint;
            Z3: bigint;
            Z4: bigint;
            W: bigint;
            Wy: bigint;
      }): ZkAffgProof {
            const proof = new ZkAffgProof(commitment, Z1, Z2, Z3, Z4, W, Wy);
            Object.freeze(proof);
            return proof;
      }

      public static fromJSON(json: ZkAffgProofJSON): ZkAffgProof {
            return ZkAffgProof.from({
                  commitment: {
                        A: BigInt(json.commitment.Adec),
                        Bx: pointFromJSON(json.commitment.Bx),
                        By: BigInt(json.commitment.Bydec),
                        E: BigInt(json.commitment.Edec),
                        S: BigInt(json.commitment.Sdec),
                        F: BigInt(json.commitment.Fdec),
                        T: BigInt(json.commitment.Tdec),
                  },
                  Z1: BigInt(json.Z1dec),
                  Z2: BigInt(json.Z2dec),
                  Z3: BigInt(json.Z3dec),
                  Z4: BigInt(json.Z4dec),
                  W: BigInt(json.Wdec),
                  Wy: BigInt(json.Wydec),
            });
      }

      public toJSON(): ZkAffgProofJSON {
            return {
                  commitment: {
                        Adec: this.commitment.A.toString(),
                        Bx: pointToJSON(this.commitment.Bx),
                        Bydec: this.commitment.By.toString(),
                        Edec: this.commitment.E.toString(),
                        Sdec: this.commitment.S.toString(),
                        Fdec: this.commitment.F.toString(),
                        Tdec: this.commitment.T.toString(),
                  },
                  Z1dec: this.Z1.toString(),
                  Z2dec: this.Z2.toString(),
                  Z3dec: this.Z3.toString(),
                  Z4dec: this.Z4.toString(),
                  Wdec: this.W.toString(),
                  Wydec: this.Wy.toString(),
            };
      }
}

export const zkAffgIsProofValid = (proof: ZkAffgProof, pub: ZkAffgPublic): boolean => {
      if (!proof) {
            return false;
      }
      if (!pub.verifier.validateCiphertext(proof.commitment.A)) {
            return false;
      }
      if (!pub.prover.validateCiphertext(proof.commitment.By)) {
            return false;
      }
      if (!isValidModN(pub.prover.n, proof.Wy)) {
            return false;
      }
      if (!isValidModN(pub.verifier.n, proof.W)) {
            return false;
      }

      const point = secp256k1.ProjectivePoint.fromAffine(proof.commitment.Bx);
      if (isIdentity(point)) {
            return false;
      }

      return true;
};

export const zkAffgCreateProof = (pub: ZkAffgPublic, priv: ZkAffgPrivate, hasher: Hasher): ZkAffgProof => {
      const N0 = pub.verifier.n;
      const N1 = pub.prover.n;

      const alpha = sampleIntervalLeps();
      const beta = sampleIntervalLprimeEps();

      const rho = sampleUnitModN(N0);
      const rhoY = sampleUnitModN(N1);

      const gamma = sampleIntervalLepsN();
      const m = sampleIntervalLN();
      const delta = sampleIntervalLepsN();
      const mu = sampleIntervalLN();

      const cAlpha = paillierMultiply(pub.verifier, pub.Kv, alpha);
      const A = paillierAdd(pub.verifier, pub.verifier.encryptWithNonce(beta, rho), cAlpha);

      const E = pub.aux.commit(alpha, gamma);
      const S = pub.aux.commit(priv.X, m);
      const F = pub.aux.commit(beta, delta);
      const T = pub.aux.commit(priv.Y, mu);

      const Bx = secp256k1.ProjectivePoint.BASE.multiply(Fn.mod(alpha)).toAffine();
      const By = pub.prover.encryptWithNonce(beta, rhoY);

      const commitment: ZkAffgCommitment = { A, Bx, By, E, S, F, T };

      const e = challenge(pub, commitment, hasher);

      const Z1 = priv.X * e + alpha;
      const Z2 = priv.Y * e + beta;
      const Z3 = e * m + gamma;
      const Z4 = e * mu + delta;
      const W = modMultiply([modPow(priv.S, e, N0), rho], N0);
      const Wy = modMultiply([modPow(priv.R, e, N1), rhoY], N1);

      return ZkAffgProof.from({
            commitment,
            Z1,
            Z2,
            Z3,
            Z4,
            W,
            Wy,
      });
};

export const zkAffgVerifyProof = (proof: ZkAffgProof, pub: ZkAffgPublic, hasher: Hasher): boolean => {
      if (!zkAffgIsProofValid(proof, pub)) {
            return false;
      }
      if (!isInIntervalLeps(proof.Z1)) {
            return false;
      }
      if (!isInIntervalLprimeEps(proof.Z2)) {
            return false;
      }

      const e = challenge(pub, proof.commitment, hasher);

      if (!pub.aux.verify(proof.Z1, proof.Z3, e, proof.commitment.E, proof.commitment.S)) {
            return false;
      }

      if (!pub.aux.verify(proof.Z2, proof.Z4, e, proof.commitment.F, proof.commitment.T)) {
            return false;
      }

      {
            const lhs = paillierAdd(
                  pub.verifier,
                  pub.verifier.encryptWithNonce(proof.Z2, proof.W),
                  paillierMultiply(pub.verifier, pub.Kv, proof.Z1)
            );
            const rhs = paillierAdd(pub.verifier, paillierMultiply(pub.verifier, pub.Dv, e), proof.commitment.A);
            if (lhs !== rhs) {
                  return false;
            }
      }

      {
            const lhs = secp256k1.ProjectivePoint.BASE.multiply(Fn.mod(proof.Z1));

            const pointXp = secp256k1.ProjectivePoint.fromAffine(pub.Xp);
            const pointBx = secp256k1.ProjectivePoint.fromAffine(proof.commitment.Bx);
            const rhs = pointXp.multiply(Fn.mod(e)).add(pointBx);

            if (!lhs.equals(rhs)) {
                  return false;
            }
      }

      {
            const lhs = pub.prover.encryptWithNonce(proof.Z2, proof.Wy);
            const rhs = paillierAdd(pub.prover, paillierMultiply(pub.prover, pub.Fp, e), proof.commitment.By);

            if (lhs !== rhs) {
                  return false;
            }
      }

      return true;
};

const challenge = (pub: ZkAffgPublic, commitment: ZkAffgCommitment, hasher: Hasher): bigint => {
      const bigHash = hasher
            .updateMulti([
                  pub.aux,
                  pub.prover as any,
                  pub.verifier as any,
                  pub.Kv,
                  pub.Dv,
                  pub.Fp,
                  pub.Xp,
                  commitment.A,
                  commitment.Bx,
                  commitment.By,
                  commitment.E,
                  commitment.S,
                  commitment.F,
                  commitment.T,
            ])
            .digestBigint();

      const challenge = Fn.sub(bigHash, 2n ** 255n); // TODO

      return challenge;
};
