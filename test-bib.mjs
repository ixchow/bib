import * as bib from './bib.js';

//note: https://maverick.inria.fr/~Xavier.Decoret/resources/xdkbibtex/bibtex_summary.html

const got = bib.parse(`
This is a comment.
%This is also a comment.
@article{
first_key,
field1 = "value",
field2 = {value2 is a "value"},
field3 = 1235,
}
Test optional comma:
@article{
other_key,
what="{"}why{"}",
}
@book{book_key}
`);

console.log(got);

const got2 = bib.parseFile('test.bib');

for (const key in got2) {
	const entry = got2[key];
	console.log(`${key} (${entry.type}):`);
	for (const field in entry.fields) {
		const value = entry.fields[field];
		console.log(`  ${field}: "${bib.unTeXValue(value)}"`);
	}
}

[
"McCann, Jim",
"McCann, Jim and Otherauthor, Fake",
"First Last and Last, First",
"First von Last and von Last, First",
"Last, Jr, First and von Last, Jr, First",
].forEach( (author) => {
	console.log(bib.splitAuthors(author));
});
