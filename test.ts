import 'reflect-metadata';
import { Container, interfaces } from 'inversify';

/*
 * Problem: Inject the right options to the an Engine based on the Engine name.
 */

// Traverse the tree to find out if any of the parent is named. Stop on the first one found.
function resolveTargetName(request: interfaces.Request): string {
  // Traverse tree in search for name to use
  if (request.target.getNamedTag()?.value) {
    return request.target.getNamedTag()?.value;
  } else if (request.parentRequest) {
    return resolveTargetName(request.parentRequest);
  } else {
    // For the sake of the exercise, there should be no unnamed injection going on
    throw new Error('Not Named!');
  }
}

// Interfaces can't be bound directly
const TYPES = {
  EngineOptions: Symbol.for('EngineOptions'),
  EngineOptionsFactory: Symbol.for('EngineOptionsFactory'),
  // Other Arbitrary Things
  EO_Make: 'EO_Make',
  EO_Torque: 'EO_Torque',
  EO_Cost: 'EO_Cost',
};

// Alias the interface.Factory<T> to something more readable
type FactoryOfEngineOptions = interfaces.Factory<EngineOptions>;

// This are the options our Engine can have.
interface EngineOptions {
  make: string;
  torque: number;
  cost: number;
}

// Our ENGINE!!! It takes a factory of EngineOptions that will be dinamically injected
class Engine {
  private _options: EngineOptions;
  constructor(config: FactoryOfEngineOptions) {
    // inversify Factories when invoked return either the type of a function that gens the type
    // use a type narrower to get the right instance
    const inst = config();
    if (this.isServiceOptions(inst)) {
      this._options = inst;
    } else {
      this._options = inst();
    }
  }

  public get options(): EngineOptions {
    return {
      ...this._options,
    };
  }

  // Regular type narrower
  private isServiceOptions(arg: ReturnType<FactoryOfEngineOptions>): arg is EngineOptions {
    return typeof arg !== 'function';
  }
}

// This function takes a container and binds the options returning the
// references so we can add the "WHENs" to it later on.
//
// This is closer to what we do in our production set
// const bindNamed = (c: Container, { cost, make, torque }: EngineOptions) => {
//   const bM = c.bind(TYPES.EO_Make).toConstantValue(make);
//   const bT = c.bind(TYPES.EO_Torque).toConstantValue(torque);
//   const bC = c.bind(TYPES.EO_Cost).toConstantValue(cost);
//   return { bM, bT, bC };
// };
//
// Later on we end up getting those refs and binding WHENING the correct name.
// For the sake of simplicity, I'm short circuiting this. The same behaviour shows
// for both approaches
//
// const bound = bindNamed(container, tb.toBind);
// Object.values(bound).forEach((ref: interfaces.BindingWhenOnSyntax<unknown>) => {
//   ref.whenTargetNamed(tb.name);
// });
//
//

// Initialize the container simple nothing in there
const container = new Container();

// Those will be our options to be bound to those names
const namedBindings = [
  { name: 'SEAT', toBind: { make: 'Cupra', cost: 1200, torque: 370 } as EngineOptions },
  { name: 'Wile E. Coyote', toBind: { make: 'ACME', cost: 742000, torque: 1000000 } as EngineOptions },
];

// Binding the above.
namedBindings.forEach((tb) => {
  container.bind(TYPES.EO_Make).toConstantValue(tb.toBind.make).whenTargetNamed(tb.name);
  container.bind(TYPES.EO_Torque).toConstantValue(tb.toBind.torque).whenTargetNamed(tb.name);
  container.bind(TYPES.EO_Cost).toConstantValue(tb.toBind.cost).whenTargetNamed(tb.name);
});

// Binding engine options. Get the name from the context and resolve dynamically
container.bind(TYPES.EngineOptions).toDynamicValue((context: interfaces.Context) => {
  const targetName = resolveTargetName(context.currentRequest);
  return {
    make: container.getNamed(TYPES.EO_Make, targetName),
    torque: container.getNamed(TYPES.EO_Torque, targetName),
    cost: container.getNamed(TYPES.EO_Cost, targetName),
  } as EngineOptions;
});

// Binding the ENGINE itself. Node the engine is not being bound BY NAME... And engine is an engine,
// By requesting it named though, it will pick up the right dependencies from the chain downwards
container.bind<Engine>(Engine).toDynamicValue((context: interfaces.Context) => {
  const targetName = resolveTargetName(context.currentRequest);

  // GETTING THE FACTORY LIKE THIS CAUSES A PROBLEM in 5.1.1
  const leFactory = container.getNamed<FactoryOfEngineOptions>(TYPES.EngineOptionsFactory, targetName);
  return new Engine(leFactory);

  // BYPASSING THE FACTORY BINDING AND RETRIEVING THIS STRAIGHT ON IS OK IN 5.1.1
  // const opts = {
  //   make: container.getNamed(TYPES.EO_Make, targetName),
  //   torque: container.getNamed(TYPES.EO_Torque, targetName),
  //   cost: container.getNamed(TYPES.EO_Cost, targetName),
  // } as EngineOptions;
  // return new Engine(() => opts);
});

// Bindind the factory of service options. Also not named itself. It should traverse correctly when named
container
  .bind<FactoryOfEngineOptions>(TYPES.EngineOptionsFactory)
  .toFactory<EngineOptions>((context: interfaces.Context) => {
    const targetName = resolveTargetName(context.currentRequest);
    return () => {
      return context.container.getNamed<EngineOptions>(TYPES.EngineOptions, targetName);
    };
  });

// TEST 1 - Getting and engine unamed throws an exception
// EXPECTED: Expected to fail. Service is not named
try {
  container.get(Engine);
  process.exit(-1);
} catch (err) {
  console.log('Expected to fail. Service is not named');
}

// TEST 2 - Getting the named bindings will retrieve engines with the right config
// EXPECTED and ACTUAL in Inversify 5.0.5:
//
// ┌────────────────┬─────────┬─────────┬────────┐
// │    (index)     │  make   │ torque  │  cost  │
// ├────────────────┼─────────┼─────────┼────────┤
// │      SEAT      │ 'Cupra' │   370   │  1200  │
// │ Wile E. Coyote │ 'ACME'  │ 1000000 │ 742000 │
// └────────────────┴─────────┴─────────┴────────┘
//
// ACTUAL in Inversify 5.1.1:
// ┌────────────────┬─────────┬────────┬──────┐
// │    (index)     │  make   │ torque │ cost │
// ├────────────────┼─────────┼────────┼──────┤
// │      SEAT      │ 'Cupra' │  370   │ 1200 │
// │ Wile E. Coyote │ 'Cupra' │  370   │ 1200 │
// └────────────────┴─────────┴────────┴──────┘

const [seat, acme] = namedBindings;

const cupraEngine = container.getNamed(Engine, seat.name);
const acmeEngine = container.getNamed(Engine, acme.name);

console.table({
  [seat.name]: cupraEngine.options,
  [acme.name]: acmeEngine.options,
});

// Interestingly, if we reverse the order of who gets retrieved first:
// the output switchs to all engines being that one ie:

// const cupraEngine = container.getNamed(Engine, seat.name);
// const acmeEngine = container.getNamed(Engine, acme.name);

// Output on Inversify 5.1.1
// ┌────────────────┬────────┬─────────┬────────┐
// │    (index)     │  make  │ torque  │  cost  │
// ├────────────────┼────────┼─────────┼────────┤
// │      SEAT      │ 'ACME' │ 1000000 │ 742000 │
// │ Wile E. Coyote │ 'ACME' │ 1000000 │ 742000 │
// └────────────────┴────────┴─────────┴────────┘
