/**
 * 友情链接 (见 src/friendLinks.yml)。
 * 和 config.yml 同一套做法: ?raw 读进来 → yaml 解析 → zod 校验, 页面里直接拿。
 * 各家好友的字段不一定齐全 (有的只有 cover, 有的只有 icon, 鸣谢组还有 icon-color / time),
 * 所以链接项的可选字段都放宽成可选。
 */
import z from "zod";
import { parse } from "yaml";
import yamlRaw from "../friendLinks.yml?raw";

const linkSchema = z.object({
    name        : z.string(),
    link        : z.string(),
    cover       : z.string().optional(),
    icon        : z.string().optional(),
    descr       : z.string().optional(),
    date        : z.string().optional(),
    time        : z.string().optional(),
    "icon-color": z.string().optional(),
});

const groupSchema = z.object({
    name       : z.string(),
    desc       : z.string().optional(),
    tag        : z.string().optional(),
    "link-list": z.array(linkSchema),
});

const friendLinksSchema = z.array(groupSchema);

export const friendLinks = friendLinksSchema.parse(parse(yamlRaw));

export type FriendLink      = z.infer<typeof linkSchema>;
export type FriendLinkGroup = z.infer<typeof groupSchema>;
