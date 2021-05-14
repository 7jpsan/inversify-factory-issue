# inversify-factory-issue
Inversify update 5.0.5 to 5.1.1 introduced a breaking change

Apparently the factory binding is causing some sort of issue when resolving named targets.

install the dependencies and run:

```
npm run test:all
```

It will install the version 5.0.5 and run the script. Then it will install 5.1.1 and run the script. Check the outputs

`inversify@5.0.5`
```
┌────────────────┬─────────┬─────────┬────────┐
│    (index)     │  make   │ torque  │  cost  │
├────────────────┼─────────┼─────────┼────────┤
│      SEAT      │ 'Cupra' │   370   │  1200  │
│ Wile E. Coyote │ 'ACME'  │ 1000000 │ 742000 │
└────────────────┴─────────┴─────────┴────────┘
```

vs

`inversify@5.1.1`
```
┌────────────────┬─────────┬────────┬──────┐
│    (index)     │  make   │ torque │ cost │
├────────────────┼─────────┼────────┼──────┤
│      SEAT      │ 'Cupra' │  370   │ 1200 │
│ Wile E. Coyote │ 'Cupra' │  370   │ 1200 │
└────────────────┴─────────┴────────┴──────┘
```

If we don't bind it as a factory then the named binding works. 