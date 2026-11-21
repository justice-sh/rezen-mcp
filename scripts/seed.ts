import { generateDataset } from "../src/data/synthetic.js";

// Phase 0/1: print a summary of the synthetic dataset.
// Phase 2: this script will insert the dataset into Postgres.
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
