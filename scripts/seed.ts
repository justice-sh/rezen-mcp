import { generateDataset } from "../src/data/synthetic.js";

// Prints a summary of the synthetic dataset. It does not touch a database:
// `pnpm db:seed` inserts the dataset into Postgres.
const data = generateDataset();
console.log(
  JSON.stringify(
    {
      schools: data.schools.length,
      classes: data.classes.length,
      students: data.students.length,
      terms: data.terms,
      currentTerm: data.currentTerm,
      subjects: data.subjects,
      scores: data.scores.length,
    },
    null,
    2,
  ),
);
