---
name: 履约协同
description: 订单履约异常协同智能体的业务模拟操作台
colors:
  ink: "#183935"
  muted: "#53685f"
  teal: "#12665d"
  deep: "#123f39"
  paper: "#f4f5f0"
  white: "#fff"
  line: "#dce3dc"
  orange: "#ad4d27"
  orange-bg: "#fcf0e7"
  green-bg: "#e8f3eb"
  red: "#a83232"
  red-bg: "#fff0ed"
typography:
  headline:
    fontFamily: '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
    fontSize: "27px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  title:
    fontFamily: '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
    fontWeight: 650
  body:
    fontFamily: '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
    fontSize: "14px"
  label:
    fontFamily: '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
    fontSize: "12px"
  quantity:
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  code:
    fontFamily: "Consolas, monospace"
    fontSize: "12px"
    lineHeight: 1.7
rounded:
  panel: "14px"
  control: "7px"
  navigation: "8px"
  badge: "5px"
  receipt: "6px"
spacing:
  controls: "8px"
  columns: "20px"
  panel-inline: "21px"
  page-inline: "34px"
components:
  button-primary:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
    typography: "{typography.label}"
  button-secondary:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.red}"
    rounded: "{rounded.control}"
    padding: "8px 14px"
  input:
    backgroundColor: "#fbfcf9"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px"
  navigation:
    textColor: "#c8dbce"
    rounded: "{rounded.navigation}"
    padding: "13px 14px"
  status-warning:
    backgroundColor: "{colors.orange-bg}"
    textColor: "#975123"
    rounded: "{rounded.badge}"
    padding: "5px 8px"
  panel:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.panel}"
  receipt:
    backgroundColor: "#f2f6ef"
    textColor: "#47684b"
    rounded: "{rounded.receipt}"
    padding: "9px 11px"
---

# Design System: 履约协同

## Overview

**Creative North Star: "履约协同操作台"**

以已记录的业务操作台版式为依据：纸白背景承载参数与回执，深青导航固定操作位置，朱橙提示缺口与例外。标准按钮、表格与字段支持连续运行、单步观察和人工审批；视觉层级来自业务状态与证据。

本文件记录已实现系统，不代表额外的用户审美认可。标志性表达是随业务回执更新的库存与履约线路图；模型文字、业务回执与完成状态保持各自清楚的层级。

**Key Characteristics:**
- 纸白底、深青导航、朱橙例外。
- 稠密但清楚的参数表与回执。
- 常规控件，线路图表达履约状态。

## Colors

### Primary

深青色 `deep` 固定导航框架；主青色 `teal` 标记主操作、有效路线和完成节点。朱橙 `orange` 用于缺口与业务例外，红色 `red` 用于错误和人工接管操作。

### Neutral

`paper` 是页面背景，`white` 是业务面板；`ink` 与 `muted` 区分结论和辅助文字，`line` 分隔稠密信息。橙、绿、红的浅底色分别承载警示、成功与错误状态。

## Typography

Segoe UI 与微软雅黑系统字体用于界面；Consolas 用于可展开原始参数。正文基准为 14px；大量辅助文字、表格、回执和控件使用 12px。页面标题为 27px / 650，650px 及以下为 23px；面板标题为 14px / 650，窄屏为 13px。订单数量为 30px / 600，窄屏为 29px；数量与统计使用 tabular-nums。

**The Readable Evidence Rule.** 功能文字不得小于 12px；窄容器中的线路数量与 ETA 使用 HTML 文字说明。

## Layout

桌面固定侧栏宽 216px，主区等量左移；顶栏高 67px，内容最大宽 1600px。工作区为 `minmax(380px,1fr) minmax(390px,1.05fr)` 双列、20px 间距，业务面板纵向间距 17px；右侧轨迹面板在桌面吸顶，内容独立滚动。

1200px 及以下侧栏改为 190px，主区横向留白 23px；路线图隐藏数量与仓名，独立图例以 12px 文本展示库存、ETA 与客户窗口。990px 及以下工作区单列，轨迹取消吸顶。650px 及以下侧栏进入正常文档流，导航与场景横排，页面横向留白 16px，操作按钮可换行。1600px 及以上页面横向留白增至 45px、列间距增至 24px。

## Elevation & Depth

以浅色面、细边框和色调分层为主。常规业务面板使用边框；轨迹面板取消边框，使用 `0 8px 28px rgba(25,61,49,.05)` 的轻阴影。短暂提示使用 `0 12px 35px #00000020`，优先级高于页面内容。没有玻璃或纹理背景。

## Shapes

面板采用温和圆角（14px）；按钮与配置输入框为 7px，导航和场景为 8px，状态签为 5px，回执为 6px。路径采用圆端线与仓库圆节点；节点身份固定，通过线条和文本更新状态。图标为内联 SVG 线框，常用线宽 1.6。

## Components

### Buttons

主按钮以青底白字承载运行或批准；次按钮白底、浅绿边框；轻按钮用于重建与导出，危险文字按钮用于接管。常规按钮高至少 37px，内边距 8px 14px，字号 12px / 550。主按钮 hover 为深青；禁用状态 opacity .43 并显示不可用指针。键盘 focus-visible 使用 3px 暖色轮廓、4px 间隔。

### Inputs / Fields

配置字段浅纸色底、1px 边框、最小高度 44px、内边距 12px。焦点为主青 2px 轮廓、2px 间隔；审批文本域为暖色浅底。字段保留明确文本标签。

### Navigation

侧栏按钮以图标和文字并列；默认浅绿字，hover 深绿背景，当前页采用浅纸绿底与深青文字。场景选择保留边框、背景与文本的组合变化；窄屏改为横排常规导航。

### Chips / Badges

承诺版本使用中性色签；业务状态签使用文字、浅底和语义色。警示、成功、错误三类同时保留状态文本，不单靠颜色表达结果。

### Cards / Containers

业务面板白底、1px 分隔色边框、14px 圆角。面板头部内边距为 20px 21px 0；订单数值、元信息与表格对齐到相同起点。表格仅使用水平分隔与选中行浅底。

### Inventory Route / Timeline

库存路线是系统的签名图形。活动线使用 7 5 虚线与 1.8s linear 流动，已交付与失败有不同线色，失败线为 3 4 虚线；1200px 及以下用独立文字图例保证数量与 ETA 的阅读尺寸。

执行轨迹采用细竖线、圆点、阶段标签、摘要与浅色回执；原始参数通过 details 展开，代码自动换行并限制高度。加载转圈周期 .8s。按钮颜色过渡为 .16s；prefers-reduced-motion 会关闭动画与过渡。

## Do's and Don'ts

### Do:
- Do 保持功能文字至少 12px，数量采用等宽数字。
- Do 在 1200px 及以下将线路数量与 ETA 放入独立的 12px HTML 说明。
- Do 用回执与状态文本共同解释颜色。
- Do 保持真实模型与业务模拟的边界提示可见。

### Don't:
- Don't 缩放 SVG 内的数量与 ETA 来挤入窄屏。
- Don't 用装饰性深度压过订单、权限和回执。
- Don't 将创建调拨的状态表现为已经签收。
