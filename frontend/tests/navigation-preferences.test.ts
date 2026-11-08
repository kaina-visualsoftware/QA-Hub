import {describe,it,expect} from "vitest";
import {
  defaultNavigationPreferences, navigationFromMetadata, parseNavigationPreferences
} from "../src/features/profile/navigation-preferences";
describe("Preferências de navegação",()=>{
  it("usa valores padrão seguros com metadata inválida",()=>{
    expect(navigationFromMetadata(null)).toEqual(defaultNavigationPreferences);
    expect(parseNavigationPreferences([])).toEqual(defaultNavigationPreferences);
    expect(navigationFromMetadata({qa_navigation_v1:{"__proto__":true,
      dashboard:false,tools:"false",public:null}})).toEqual({
      dashboard:false,tools:true,public:true,admin:true
    });
  });
  it("permite ocultar apenas itens opcionais",()=>{
    expect(navigationFromMetadata({qa_navigation_v1:{tools:false,public:false,
      admin:false,dashboard:false, tarefas:false, perfil:false}})).toEqual({
      dashboard:false,tools:false,public:false,admin:false
    });
  });
});
