# Snapshot report for `test/exos/settler.test.ts`

The actual snapshot is saved in `settler.test.ts.snap`.

Generated by [AVA](https://avajs.dev).

## stateShape

> Snapshot 1

    {
      intermediateRecipient: Object @match:or {
        payload: [
          Object @match:kind {
            payload: 'undefined',
          },
          {
            chainId: Object @match:string {
              payload: [],
            },
            encoding: Object @match:string {
              payload: [],
            },
            value: Object @match:string {
              payload: [],
            },
          },
        ],
      },
      mintedEarly: Object @match:remotable {
        payload: {
          label: 'mintedEarly',
        },
      },
      registration: Object @match:or {
        payload: [
          Object @match:kind {
            payload: 'undefined',
          },
          Object @match:remotable {
            payload: {
              label: 'Registration',
            },
          },
        ],
      },
      remoteDenom: Object @match:string {
        payload: [],
      },
      repayer: Object @match:remotable {
        payload: {
          label: 'Repayer',
        },
      },
      settlementAccount: Object @match:remotable {
        payload: {
          label: 'Account',
        },
      },
      sourceChannel: Object @match:string {
        payload: [],
      },
    }
