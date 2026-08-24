# Resume → Portfolio mapping matrix

Source of truth: `src/utils/resumeData.js` `normalizeResumeData()`.
Adapter: `src/utils/portfolioData.js` `convertResumeToPortfolio()`.
Direction: one-way. Portfolio edits never write resume documents.

| Master resume field | Canonical portfolio field | Rendered in all 4 templates |
| --- | --- | --- |
| firstname | heading.firstname | yes (as full name) |
| lastname | heading.lastname | yes |
| firstname + lastname | heading.fullName | yes |
| occupation | heading.occupation | yes |
| email | heading.email | yes |
| phone | heading.phone | yes |
| city | heading.city | yes |
| country | heading.country | yes |
| address | heading.address | yes where contact/address is shown |
| postalcode | heading.postalcode | yes where contact/address is shown |
| website | heading.website | yes |
| linkedin | heading.linkedin | yes |
| github | heading.github | yes |
| photo | heading.photo | yes if present |
| summary | summary | About / hero |
| employments[].jobTitle | experiences[].jobTitle | yes |
| employments[].employer | experiences[].employer | yes |
| employments[].begin | experiences[].begin | yes |
| employments[].end | experiences[].end | yes |
| employments[].description | experiences[].description | yes |
| educations[].school | education[].school | yes |
| educations[].degree | education[].degree | yes |
| educations[].started | education[].started | yes |
| educations[].finished | education[].finished | yes |
| educations[].description | education[].description | yes |
| skills[].name / skillName | skills[].name | yes |
| skills[].rating | skills[].rating | yes (visual treatment varies) |
| projects[].title | projects[].title | yes |
| projects[].description | projects[].description | yes |
| projects[].url / link | projects[].link | yes |
| projects[].technologies | projects[].technologies / technologyList | yes |
| certifications[].title | certifications[].title | yes |
| certifications[].issuer | certifications[].issuer | yes |
| certifications[].date | certifications[].date | yes |
| certifications[].description | certifications[].description | yes if present |
| certifications[].url / link | certifications[].link | stored; shown when present |
| achievements[].title | achievements[].title | yes |
| achievements[].description | achievements[].description | yes |
| references[].name | references[].name | yes |
| references[].reference | references[].reference | yes |
| languages[].name | languages[].name | yes |
| languages[].level | languages[].level | yes |
| hobbies | hobbies[] | yes |
| customSections[].title | customSections[].title | yes |
| customSections[].items[].title | customSections[].items[].title | yes |
| customSections[].items[].description | customSections[].items[].description | yes |

Aliases are normalized once in the adapter (jobTitle/position/role, employer/company, begin/startDate, school/institution, etc.). Templates never interpret aliases independently.

## Templates

1. `modernMinimal` — light / modern SaaS
2. `executive` — light / editorial corporate
3. `creativeDark` — warm dark / asymmetric creative (not cyber)
4. `premiumTech` — dark SaaS / glass product (not cyber)

Template switching only changes `templateKey`. Canonical data is unchanged.
