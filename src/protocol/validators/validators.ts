import Validator from "./validator";

export class Validators {
      private static partyIDs: Validator[] = [];

      private constructor(partyID: Validator) {
            Validators.partyIDs.push(partyID);
            Validators.partyIDs.sort();
      }

      // Returns a sorted slice from partyIDs.
      static create(partyID: Validator): Validators {
            if (this.partyIDs.includes(partyID)) return;
            return new Validators(partyID);
      }

      // Returns true if partyIDs contains id.
      // Assumes that the Validators is valid.
      public contains(...ids: Validator[]): boolean {
            for (const id of ids) {
                  const index = this.search(id);
                  if (index < 0) {
                        return false;
                  }
            }
            return true;
      }

      // Returns true if the Validators is sorted and does not contain any duplicates.
      public isValid(): boolean {
            const n = Validators.partyIDs.length;
            for (let i = 1; i < n; i++) {
                  if (Validators.partyIDs[i - 1] >= Validators.partyIDs[i]) {
                        return false;
                  }
            }
            return true;
      }

      // Finds id in partyIDs and returns a copy of the slice if it was found.
      public remove(id: string): Validator[] {
            return Validators.partyIDs.filter((partyID) => partyID.ID !== id);
      }

      // Returns the length of the Validators.
      public get length(): number {
            return Validators.partyIDs.length;
      }

      // search returns the index of x in the sorted array.
      private search(x: Validator): number {
            return Validators.partyIDs.indexOf(x);
      }

      // Domain implements hash.WriterToWithDomain, and separates this type within hash.Hash.
      static domain(): string {
            return "Validators";
      }

      // String implements fmt.Stringer.
      public toString(): string {
            return Validators.partyIDs.join(", ");
      }
}
