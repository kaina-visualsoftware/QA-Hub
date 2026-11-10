import {it,expect} from "vitest";
import {imageFromClipboard} from "../src/features/evidence/ScenarioEvidencePanel";

it("colagem vincula somente imagens PNG/JPG/WEBP e preserva os bytes",async()=>{
  const png=new File([Uint8Array.of(137,80,78,71,13,10,26,10,1,2)],
    "clipboard.png",{type:"image/png"});
  const event={clipboardData:{items:[
    {kind:"string",type:"text/plain",getAsFile:()=>null},
    {kind:"file",type:"image/png",getAsFile:()=>png}
  ]}};
  const file=imageFromClipboard(event as unknown as React.ClipboardEvent);
  expect(file).not.toBeNull();
  expect(file?.type).toBe("image/png");
  expect(file?.name).toMatch(/^captura-\d+\.png$/);
  expect(file?.size).toBe(png.size);
  expect(imageFromClipboard({clipboardData:{items:[
    {kind:"file",type:"application/pdf",getAsFile:()=>new File(["abc"],"x.pdf")}
  ]}} as unknown as React.ClipboardEvent)).toBeNull();
});
