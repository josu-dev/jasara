import * as net from 'node:net';

export abstract class IpAddress {
    readonly ip_string: string;

    constructor(ip_string: string) {
        this.ip_string = ip_string;
    }

    static parse(raw_ip: string): IpAddress {
        switch (net.isIP(raw_ip)) {
            case 4: return new Ipv4Address(raw_ip);
            case 6: return new Ipv6Address(raw_ip);
            default: throw new Error(`Invalid IP address: ${raw_ip}`);
        }
    }

    public get_ip(): string {
        return this.ip_string;
    }

    public abstract get_version(): 4 | 6;

    public abstract is_local(): boolean;

    public abstract is_private(): boolean;

    public abstract get_subnet(): string | undefined;
}

type Ipv4AddressOctets = [number, number, number, number];

type Ipv4AddressClass = typeof Ipv4Address.CLASS[keyof typeof Ipv4Address.CLASS];

export class Ipv4Address extends IpAddress {
    static readonly CLASS = {
        A: 1,
        B: 2,
        C: 3,
        D: 4,
    } as const;

    #octets: Ipv4AddressOctets;
    #class: Ipv4AddressClass;

    constructor(ip_string: string) {
        super(ip_string);
        const parts = ip_string.split('.');
        this.#octets = [parseInt(parts[0]), parseInt(parts[1]), parseInt(parts[2]), parseInt(parts[3])];

        if (this.#octets[0] < 128) {
            this.#class = Ipv4Address.CLASS.A;
        } else if (this.#octets[0] < 192) {
            this.#class = Ipv4Address.CLASS.B;
        } else if (this.#octets[0] < 224) {
            this.#class = Ipv4Address.CLASS.C;
        } else {
            this.#class = Ipv4Address.CLASS.D;
        }
    }

    public static is_ipv4(ip: IpAddress): ip is Ipv4Address {
        return ip.get_version() === 4;
    }

    public get_version(): 4 {
        return 4;
    }

    public is_local(): boolean {
        return this.#octets[0] === 127;
    }

    public is_private(): boolean {
        return (
            this.#octets[0] === 10 ||
            (this.#octets[0] === 172 && this.#octets[1] >= 16 && this.#octets[1] <= 31) ||
            (this.#octets[0] === 192 && this.#octets[1] === 168)
        );
    }

    public get_subnet(): string | undefined {
        if (this.is_local()) {
            return '127.0.0.0/8';
        }
        if (this.#octets[0] === 10) {
            return '10.0.0.0/8';
        }
        if (this.#octets[0] === 172 && this.#octets[1] >= 16 && this.#octets[1] <= 31) {
            return '172.16.0.0/12';
        }
        if (this.#octets[0] === 192 && this.#octets[1] === 168) {
            return '192.168.0.0/16';
        }
        return undefined;
    }

    public get_class(): Ipv4AddressClass {
        return this.#class;
    }

    public get_octets(): Ipv4AddressOctets {
        return [...this.#octets];
    }
}

type Ipv6AddressHextets = [number, number, number, number, number, number, number, number];

export class Ipv6Address extends IpAddress {
    #hextets: Ipv6AddressHextets;
    #is_mapped_v4: boolean;

    constructor(ip_string: string) {
        super(ip_string);

        const expanded = this.#expandIPv6Address(ip_string);
        const parts = expanded.split(':');
        this.#hextets = parts.map(p => parseInt(p, 16)) as Ipv6AddressHextets;

        // is like (::ffff:a.b.c.d or ::ffff:XXXX:XXXX)
        this.#is_mapped_v4 = (
            this.#hextets[0] === 0 &&
            this.#hextets[1] === 0 &&
            this.#hextets[2] === 0 &&
            this.#hextets[3] === 0 &&
            this.#hextets[4] === 0 &&
            this.#hextets[5] === 0xffff
        );
    }

    public static is_ipv6(ip: IpAddress): ip is Ipv6Address {
        return ip.get_version() === 6;
    }

    #expandIPv6Address(address: string): string {
        // Handle special case of IPv4-mapped addresses
        if (address.includes('.')) {
            const lastColonIndex = address.lastIndexOf(':');
            const ipv4Part = address.substring(lastColonIndex + 1);
            const ipv6Part = address.substring(0, lastColonIndex + 1);

            // Convert IPv4 part to IPv6 format
            const ipv4Parts = ipv4Part.split('.');
            const hexPart1 = ((parseInt(ipv4Parts[0]) << 8) + parseInt(ipv4Parts[1])).toString(16);
            const hexPart2 = ((parseInt(ipv4Parts[2]) << 8) + parseInt(ipv4Parts[3])).toString(16);

            address = ipv6Part + hexPart1 + ':' + hexPart2;
        }

        // Handle abbreviated IPv6 addresses
        if (!address.includes('::')) {
            // Fill any missing parts with zeros if needed
            const parts = address.split(':');
            if (parts.length < 8) {
                return parts.concat(Array(8 - parts.length).fill('0')).join(':');
            }
            return address; // Already fully expanded
        }

        const parts = address.split('::');
        const leftParts = parts[0] ? parts[0].split(':') : [];
        const rightParts = parts[1] ? parts[1].split(':') : [];

        // Calculate how many 0 groups we need to insert
        const missingGroups = 8 - leftParts.length - rightParts.length;

        // Build the expanded address
        const expandedParts = [
            ...leftParts,
            ...Array(missingGroups).fill('0'),
            ...rightParts
        ];

        return expandedParts.join(':');
    }

    public get_version(): 6 {
        return 6;
    }

    public is_local(): boolean {
        for (let i = 0; i < 7; i++) {
            if (this.#hextets[i] !== 0) return false;
        }
        return this.#hextets[7] === 1;
    }

    public is_private(): boolean {
        return (
            // fd00::/8 - Unique Local Addresses
            (this.#hextets[0] & 0xfe00) === 0xfd00 ||
            // fc00::/7 - another representation of ULAs
            (this.#hextets[0] & 0xfe00) === 0xfc00 ||
            // fe80::/10 - Link-local addresses
            (this.#hextets[0] & 0xffc0) === 0xfe80
        );
    }

    public get_subnet(): string | undefined {
        if (this.is_local()) {
            return '::1/128'; // Loopback address
        }
        if ((this.#hextets[0] & 0xfe00) === 0xfc00 || (this.#hextets[0] & 0xfe00) === 0xfd00) {
            return 'fc00::/7'; // Unique Local Addresses
        }
        if ((this.#hextets[0] & 0xffc0) === 0xfe80) {
            return 'fe80::/10'; // Link-local addresses
        }
        return undefined;
    }

    public is_mapped_v4(): boolean {
        return this.#is_mapped_v4;
    }

    public get_mapped_v4(): Ipv4Address | undefined {
        if (!this.#is_mapped_v4) {
            return undefined;
        }

        const byte1 = (this.#hextets[6] >> 8) & 0xff;
        const byte2 = this.#hextets[6] & 0xff;
        const byte3 = (this.#hextets[7] >> 8) & 0xff;
        const byte4 = this.#hextets[7] & 0xff;
        return new Ipv4Address(`${byte1}.${byte2}.${byte3}.${byte4}`);
    }

    public get_hextets(): Ipv6AddressHextets {
        return [...this.#hextets];
    }
}
