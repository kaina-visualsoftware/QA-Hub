/** Shared brand asset; the adjacent product name provides the accessible label. */
export function BrandLogo({large=false}:{large?:boolean}){
  return <img className={large?"qa-brand-logo qa-brand-logo-large":"qa-brand-logo"}
    src={import.meta.env.BASE_URL+"favicon.svg"} alt="" aria-hidden="true"
    width={large?64:40} height={large?64:40}/>;
}
