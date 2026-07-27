import {readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';
import {login} from './helpers.js';

const fixture=JSON.parse(readFileSync(new URL('../../scripts/certification/fixture-state.json',import.meta.url),'utf8'));
const password=fixture.password;
const pm={email:fixture.users.pmAAssigned.email,password};
const contractor={email:fixture.users.contractorAAssigned.email,password};
const projectId=fixture.projects.PROJECT_A;

async function assertNoHorizontalOverflow(page,width){await page.setViewportSize({width,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy()}
async function switchUser(page,credentials){await page.evaluate(()=>localStorage.clear());await page.reload();await login(page,credentials)}

test('local mobile field workflow: reject, correct, resubmit and terminal close',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await login(page,pm);
  await page.goto(`/projects/${projectId}/snags/new`);
  const title=`E2E mobile snag ${Date.now()}`;
  await page.getByLabel(/Title/).fill(title);
  await page.getByLabel('Description',{exact:true}).fill('Field workflow certification issue');
  await page.getByLabel('Discipline').fill('ARCH');
  await page.getByLabel('Assignee').selectOption(fixture.users.contractorAAssigned.id);
  await page.getByLabel('Location description').fill('North entrance door');
  await page.getByRole('button',{name:'Create snag'}).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/snags/[0-9a-f-]{36}$`));
  const detailUrl=page.url();
  await expect(page.getByText('Assigned',{exact:true})).toBeVisible();
  await assertNoHorizontalOverflow(page,320);await assertNoHorizontalOverflow(page,375);await assertNoHorizontalOverflow(page,412);
  await switchUser(page,contractor);await page.goto(detailUrl);
  await page.getByRole('button',{name:'Start work'}).click();
  await expect(page.getByText('In progress',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Ready for review'}).click();
  await expect(page.getByText('Ready for review',{exact:true})).toBeVisible();
  await switchUser(page,pm);await page.goto(detailUrl);
  await page.getByLabel(/Reason for rejection/).fill('Alignment still outside tolerance');
  await page.getByRole('button',{name:/Reject — send back to Contractor/}).click();
  await expect(page.getByText('In progress',{exact:true})).toBeVisible();
  await switchUser(page,contractor);await page.goto(detailUrl);
  await expect(page.getByText('Alignment still outside tolerance')).toBeVisible();
  await page.getByRole('button',{name:'Ready for review'}).click();
  await expect(page.getByText('Ready for review',{exact:true})).toBeVisible();
  await switchUser(page,pm);await page.goto(detailUrl);
  await page.getByRole('button',{name:'Approve & close'}).click();
  await expect(page.getByText('Closed',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/Reopen/})).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Closed',{exact:true})).toBeVisible();
  await page.setViewportSize({width:1280,height:800});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
});
