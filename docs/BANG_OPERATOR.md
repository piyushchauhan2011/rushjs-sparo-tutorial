# Standard idiomatic way to write TypeORM entities

What ! means there. On a property declaration it's a definite assignment assertion, not the non-null assertion operator you'd use in an expression (foo!.bar). It only exists to satisfy strictPropertyInitialization, which complains because nothing in the class body assigns id, name, etc. TypeORM hydrates instances outside the constructor (it calls Object.create and assigns columns from the row), so the compiler genuinely can't see the assignment. ! is you telling it "the ORM handles this."

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

Your existing booking.entity.ts uses the same pattern throughout, so the file you pasted is consistent with the codebase.
