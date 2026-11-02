import { Routes } from '@angular/router';
import { ArmoryPage } from './ui/armory.page';
import { CalculatorPage } from './ui/calculator.page';
import { InventoryPage } from './ui/inventory.page';
import { PantheonPage } from './ui/pantheon.page';
import { PricesPage } from './ui/prices.page';
import { RecipesPage } from './ui/recipes.page';
import { DamagePage } from './ui/damage.page';
import { KinaPage } from './ui/kina.page';
import { SettingsPage } from './ui/settings.page';

export const routes: Routes = [
  { path: '', component: CalculatorPage, title: 'Calculator · Aion 2 Craft Lab' },
  { path: 'prices', component: PricesPage, title: 'Prices · Aion 2 Craft Lab' },
  { path: 'inventory', component: InventoryPage, title: 'Inventory · Aion 2 Craft Lab' },
  { path: 'recipes', component: RecipesPage, title: 'Recipes · Aion 2 Craft Lab' },
  { path: 'pantheon', component: PantheonPage, title: 'Pantheon · Aion 2 Craft Lab' },
  { path: 'armory', component: ArmoryPage, title: 'Armory and BiS - Aion 2 Craft Lab' },
  { path: 'kina', component: KinaPage, title: 'Kina chests · Aion 2 Craft Lab' },
  { path: 'damage', component: DamagePage, title: 'Damage research - Aion 2 Craft Lab' },
  { path: 'settings', component: SettingsPage, title: 'Settings · Aion 2 Craft Lab' },
  { path: '**', redirectTo: '' },
];
