import reactConfig from "@hotel/eslint-config/react";

export default [
  ...reactConfig,
  {
    files: ["src/components/**/*.tsx"],
    rules: {
      // shadcn/ui components export their `cva` variants next to the component
      // (`buttonVariants`, `badgeVariants`, ...), which trips this rule. The
      // shadcn CLI generates files in exactly that shape, so splitting the
      // variants into separate modules would be undone by the next
      // `shadcn add <component>` and leave this package inconsistent with every
      // generated file. The cost is only that editing a component here triggers
      // a full reload instead of a Fast Refresh patch.
      //
      // The rule stays enabled in apps/web, where the route and component files
      // are hand-written and Fast Refresh actually matters day to day.
      "react-refresh/only-export-components": "off",
    },
  },
];
