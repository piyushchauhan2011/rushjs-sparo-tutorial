# Standard idiomatic way to write TypeORM entities

What ! means there. On a property declaration it's a definite assignment assertion, not the non-null assertion operator you'd use in an expression (foo!.bar). It only exists to satisfy strictPropertyInitialization, which complains because nothing in the class body assigns id, name, etc. TypeORM hydrates instances outside the constructor — `EntityMetadata.create()` calls the no-argument constructor (or `Object.create(target.prototype)` on the deserializer path) and then assigns the columns from the row — so the compiler genuinely can't see the assignment. ! is you telling it "the ORM handles this."

The alternatives are all worse for this case:

- id?: string — makes every column T | undefined, so every read site needs a narrow, even though the column is NOT NULL.
- id: string = "" — fabricates defaults that TypeORM overwrites anyway, and default values on a @Column property can confuse TypeORM's insert behaviour.
- turning off strictPropertyInitialization — loses the check across your whole non-entity code.

The one real caveat, and it applies to your hotel and bookings fields more than the scalar columns: ! is an assertion, not a guarantee. Relations are undefined unless you actually load them:

const rt = await repo.findOneBy({ id }); // rt.hotel is typed Hotel, is actually undefined
const rt2 = await repo.findOne({ where: { id }, relations: { hotel: true } }); // now populated

So roomType.hotel.name type-checks and then throws at runtime. Same for new RoomType() in a seed script or test — every ! field is undefined until you assign it. That's the tax you accept; there's no way to express "populated only when I asked for it" in the entity type itself. The usual mitigation is to keep the FK scalar (hotelId) alongside the relation — which you already do — and prefer it whenever you just need the id, so you only touch hotel at sites where you know you passed relations.

Two smaller notes on the entities as written:

- If a column is nullable in the DB, the type should say so: @Column({ type: "text", nullable: true }) description!: string | null. ! doesn't cover nullability, only initialization.
- If you ever move to useDefineForClassFields semantics (native class fields, which is the default under target: ES2022), ! stays correct precisely because it emits no field definition. A plain description?: string would emit description = undefined and clobber what the ORM writes. So ! is actually the safer form here, not just the terser one.

## Why the official TypeORM docs don't show `!`

Worth knowing, because it looks like a contradiction: none of TypeORM's own material uses the operator. [typeorm.io's one-to-one page](https://typeorm.io/docs/relations/one-to-one-relations) writes `id: number`, `profile: Profile`; [`.github/copilot-instructions.md`](https://github.com/typeorm/typeorm/blob/master/.github/copilot-instructions.md) writes `id: number`, `photos: Photo[]`. Neither file mentions `!`, `strictPropertyInitialization`, or `strictNullChecks` at all, and [the getting-started page](https://typeorm.io/docs/getting-started) asks only for `emitDecoratorMetadata` and `experimentalDecorators` in your tsconfig.

That is an omission, not a recommendation. Those samples only compile with `strictPropertyInitialization` off; copy them into a `strict: true` project and every property fails with TS2564, "Property 'id' has no initializer and is not definitely assigned in the constructor" (TypeORM issue [#2797](https://github.com/typeorm/typeorm/issues/2797)). The docs are written against the loose default, so they never have to pick between the two fixes — `!` on each property, or `strictPropertyInitialization: false`.

This repo does have to pick. `packages/typescript-config/base.json` sets `strict: true`, which `nestjs.json` inherits, so `apps/api` resolves to `strictPropertyInitialization: true` (confirmable with `npx tsc --showConfig` in `apps/api`). Given that, `!` is the choice this codebase made, for the reasons above.

Your existing booking.entity.ts uses the same pattern throughout, so the file you pasted is consistent with the codebase.
