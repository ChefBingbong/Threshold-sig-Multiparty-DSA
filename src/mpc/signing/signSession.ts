import { secp256k1 } from "@noble/curves/secp256k1";

import { PartyId, PartySecretKeyConfig } from "../keygen/partyKey";
import { lagrange } from "../math/polynomial/lagrange";
import Fn from "../math/polynomial/Fn";
import { Hasher } from "../utils/hasher";
import { randBetween } from "bigint-crypto-utils";
import { SignRequest } from "./sign";
import { SignPartyInputRound1 } from "./types";

export class SignSession {
      // private signRequest: SignRequest;
      // private keyConfig: PartySecretKeyConfig;

      public currentRound = 0;
      public curve = "secp256k1";
      public finalRound = 5;
      public partyIds: Array<PartyId>;
      public protocolId = "cmp/sign";
      public selfId: PartyId;
      public sessionId: bigint;
      public threshold: number;
      public hasher: Hasher;
      public output: any;
      public inputForRound1: SignPartyInputRound1;

      // public currentRound: number;
      public isBroadcastRound: boolean;
      public isDirectMessageRound: boolean;

      constructor() {
            this.isBroadcastRound = false;
            this.isDirectMessageRound = false;
            this.currentRound = 0;
      }

      public init(signRequest: SignRequest, keyConfig: PartySecretKeyConfig) {
            this.partyIds = signRequest.signerIds;
            this.selfId = keyConfig.partyId;
            this.threshold = keyConfig.threshold;

            this.sessionId = randBetween(2n ** 256n);

            const lag = lagrange(signRequest.signerIds);
            let publicKey = secp256k1.ProjectivePoint.ZERO;

            // TODO: see if can just reuse keyConfig.publicPartyData
            const partiesPublic: SignPartyInputRound1["partiesPublic"] = {};
            signRequest.signerIds.forEach((partyId) => {
                  const partyData = keyConfig.publicPartyData[partyId];
                  const point = secp256k1.ProjectivePoint.fromAffine(partyData.ecdsa);
                  const scaledPoint = point.multiply(lag[partyId]);
                  publicKey = publicKey.add(scaledPoint);
                  partiesPublic[partyId] = {
                        ecdsa: scaledPoint.toAffine(),
                        paillier: partyData.paillier,
                        pedersen: partyData.pedersen,
                  };
            });

            this.hasher = Hasher.create().update("CMP-BLAKE");
            this.hasher.update(this.protocolId);
            this.hasher.update(keyConfig);
            this.hasher.update(signRequest.message);

            this.output = {
                  message: signRequest.message,
                  secretEcdsa: Fn.mul(lag[keyConfig.partyId], keyConfig.ecdsa),
                  secretPaillier: keyConfig.paillier,
                  publicKey: publicKey.toAffine(),
                  partiesPublic,
            };

            this.inputForRound1 = {
                  message: signRequest.message,
                  secretEcdsa: Fn.mul(lag[keyConfig.partyId], keyConfig.ecdsa),
                  secretPaillier: keyConfig.paillier,
                  publicKey: publicKey.toAffine(),
                  partiesPublic,
            };
      }

      public cloneHashForId(id: PartyId): Hasher {
            return this.hasher.clone().update(id);
      }
}
